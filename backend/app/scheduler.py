"""Background scheduler — periodically re-runs the full scan+assess cycle
so the dashboard reflects "continuous monitoring," not a one-time snapshot.
Runs as a daemon thread inside the same process as the API server; no
external job queue or cron needed for the demo.

Deliberately not Celery: a distributed task queue needs a broker (Redis or
RabbitMQ) deployed and kept healthy alongside this service, plus worker
process management — real new infrastructure and a real new failure mode,
for a workload (one recurring job, one process) that a daemon thread
already handles reliably. Celery would earn its cost if this ever needed
multiple worker processes, retries across machines, or task routing; at
this project's scale it would be complexity with no user-visible payoff,
and a real risk of destabilizing a working, demo-proven system.

Set SCAN_INTERVAL_SECONDS=0 in .env to disable.
"""

import threading
import time
from datetime import datetime, timezone

from app.config import SCAN_INTERVAL_SECONDS

_state = {
    "enabled": SCAN_INTERVAL_SECONDS > 0,
    "interval_seconds": SCAN_INTERVAL_SECONDS,
    "run_count": 0,
    "last_run": None,
    "last_status": "not started",
}
_started = False


def get_scheduler_status() -> dict:
    return dict(_state)


def _loop():
    from app.database import SessionLocal
    from app.scan_pipeline import run_full_cycle
    from app.manual_scan import (
        get_manual_scan_status, mark_scheduled_scan_start, mark_scheduled_scan_end,
        progress_reporter, cancel_checker,
    )

    while True:
        time.sleep(_state["interval_seconds"])

        # Manual and scheduled scans share one progress/cancel state
        # (mark_scheduled_scan_start below resets it, same as a manual
        # scan's own start). Without this guard, an interval tick landing
        # while a manual scan (or a previous scheduled cycle that ran long)
        # is still in progress would reset that shared state out from under
        # it and start a second run_full_cycle() concurrently — both then
        # sharing the same cancel flag, so a Stop click on either meant to
        # stop one run silently cancels both. Skip this tick instead; the
        # next one picks up once the current run finishes.
        if get_manual_scan_status()["running"]:
            _state["last_status"] = "skipped (a scan was already running)"
            continue

        db = SessionLocal()
        # Reports into manual_scan.py's shared _state — same progress
        # banner the dashboard polls for a button-triggered scan, so an
        # automatic re-scan shows up there too rather than running
        # invisibly until it's done. cancel_checker() means the same "Stop
        # scan" button interrupts an automatic run too, not just a manual
        # one — there's no separate "stop the scheduler's scan" control.
        mark_scheduled_scan_start()
        try:
            result = run_full_cycle(
                db, triggered_by="scheduled", on_progress=progress_reporter(), should_cancel=cancel_checker(),
            )
            _state["last_status"] = "ok"
            mark_scheduled_scan_end(result=result)
        except Exception as e:
            _state["last_status"] = f"error: {e}"
            mark_scheduled_scan_end(error=str(e))
        finally:
            db.close()
            _state["run_count"] += 1
            _state["last_run"] = datetime.now(timezone.utc).isoformat(timespec="seconds")


def start_scheduler():
    global _started
    if _started or not _state["enabled"]:
        return
    _started = True
    thread = threading.Thread(target=_loop, daemon=True)
    thread.start()
