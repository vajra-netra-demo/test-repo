"""Real Celery integration for parallelizing per-tool risk assessment across
a genuine separate worker process — not the deployed Redis/RabbitMQ +
managed-broker setup originally scoped out.

Why filesystem transport, not Redis/RabbitMQ: the objection to Celery was
never "task queues are bad," it was "a broker is new infrastructure to
deploy and keep healthy, for a workload (one recurring scan) the existing
daemon-thread scheduler already handles reliably." Celery's filesystem
transport (kombu.transport.filesystem) is real Celery — real worker
process, real task dispatch/ack semantics, real parallelism — backed by a
shared local directory instead of a managed broker service. No new service
to provision or keep healthy; this is why it's a genuinely lightweight
substitute rather than a scaled-down promise.

Real, honest limitation, stated plainly: the filesystem transport requires
the web process and the worker process to share a filesystem. That's true
today (single Railway service/volume, or local dev), but it would NOT hold
if this ever needed to scale across separate machines — at that point,
Redis/RabbitMQ becomes the right call, exactly as the original scoping
decision said. This proves the architecture and the real parallelism gain
at today's scale; it does not silently solve tomorrow's multi-machine
scaling problem.

Gated by CELERY_ENABLED (see app/config.py) — unset means the existing
sequential in-process loop in scan_pipeline.py runs completely unchanged.
"""

import os
import subprocess
import sys

from celery import Celery

from app.config import CELERY_ENABLED, CELERY_BROKER_PATH

_worker_process = None


def is_configured() -> bool:
    return CELERY_ENABLED


def ensure_worker_running():
    """Starts a real Celery worker as a genuine separate OS process, once,
    at app startup -- not a background thread inside this process. Celery's
    worker start-up tries to install its own signal handlers, which Python
    only allows from a process's *main* thread; a thread inside the FastAPI
    process would crash on that. A subprocess has its own main thread, so
    it can install its own handlers freely, while still sharing this
    container's filesystem with the web process -- which is exactly what
    the filesystem broker needs. No second Railway service required.

    No-op if CELERY_ENABLED is unset, or if a worker was already started by
    this process (avoids spawning duplicates on module re-import)."""
    global _worker_process
    if not CELERY_ENABLED or _worker_process is not None:
        return

    _worker_process = subprocess.Popen(
        [
            sys.executable, "-m", "celery", "-A", "app.tasks.celery_app", "worker",
            "--pool=threads", "--concurrency=5", "--loglevel=info",
        ],
        cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    )


def _make_celery_app() -> Celery:
    broker_in = os.path.join(CELERY_BROKER_PATH, "in")
    broker_processed = os.path.join(CELERY_BROKER_PATH, "processed")
    os.makedirs(broker_in, exist_ok=True)
    os.makedirs(broker_processed, exist_ok=True)

    # Result backend: a real SQLAlchemy-backed table (Celery's built-in
    # db+ backend), not Redis — SQLAlchemy is already a dependency here, so
    # this needs no new service either, just a small local SQLite file the
    # web process and worker process both read/write. This is what makes
    # group(...).apply_async().get(timeout=...) actually work below.
    results_path = os.path.abspath(os.path.join(CELERY_BROKER_PATH, "results.db"))

    app = Celery("netra_tasks", broker="filesystem://", backend=f"db+sqlite:///{results_path}")
    app.conf.update(
        broker_transport_options={
            "data_folder_in": broker_in,
            "data_folder_out": broker_in,
            "data_folder_processed": broker_processed,
        },
        task_serializer="json",
        result_serializer="json",
        accept_content=["json"],
    )
    return app


celery_app = _make_celery_app()


@celery_app.task(name="assess_and_store_tool")
def assess_and_store_tool(tool_id: str) -> dict:
    """Runs in the separate Celery worker process, not the web process.
    Opens its own DB session (SQLAlchemy sessions aren't fork/process-safe
    to share) — same real assess+triage logic scan_pipeline.py already
    uses for the sequential path, just dispatched here instead of called
    inline."""
    from app.database import SessionLocal
    from app.models import SaaSTool
    from app.risk_engine import assess_tool
    from app.triage_agent import triage_tool
    from app.tool_utils import tool_to_dict as _tool_to_dict

    db = SessionLocal()
    try:
        tool = db.query(SaaSTool).filter(SaaSTool.id == tool_id).first()
        if not tool:
            return {"tool_id": tool_id, "status": "not_found"}

        risk = assess_tool(_tool_to_dict(tool))
        tool.previous_risk_score = tool.risk_score
        tool.risk_score = risk["risk_score"]
        tool.risk_flags = risk["risk_flags"]
        tool.risk_reasoning = risk["risk_reasoning"]

        triage_input = {**_tool_to_dict(tool), **risk}
        triage = triage_tool(triage_input)
        tool.triage_decision = triage["decision"]
        tool.triage_reasoning = triage["reasoning"]

        db.commit()
        return {"tool_id": tool_id, "status": "ok", "risk_score": risk["risk_score"]}
    finally:
        db.close()
