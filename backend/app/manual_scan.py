"""Background runner for a manually-triggered scan (the dashboard's "Run
Live Scan" button / POST /discovery/live-scan).

Runs run_full_cycle() in its own thread, the same way scheduler.py already
does for the automatic 30-minute cycle — necessary because with enough
tools, one real Claude call per tool can make a full cycle take longer than
Railway's gateway timeout. A synchronous request that long gets killed
mid-cycle by the proxy before the DB commit at the end ever runs, so
nothing gets saved even though the backend was still working. Firing it in
a background thread and letting the dashboard poll for completion removes
the HTTP request from that critical path entirely.
"""

import threading
from datetime import datetime

_state = {
    "running": False,
    "started_at": None,
    "finished_at": None,
    "last_result": None,
    "last_error": None,
    "phase": "idle",
    "processed": 0,
    "total": 0,
    "current_tool": None,
    "cancel_requested": False,
    "cancelled": False,
}


def get_manual_scan_status() -> dict:
    return dict(_state)


def request_cancel() -> bool:
    """Returns False if there's no running scan to cancel. The scan loop
    checks this cooperatively between tools -- it stops promptly rather
    than instantly, but whatever was already assessed before the stop is
    kept (committed), not discarded."""
    if not _state["running"]:
        return False
    _state["cancel_requested"] = True
    return True


def _should_cancel() -> bool:
    return _state["cancel_requested"]


def _on_progress(phase: str, processed: int, total: int, current_tool: str = None):
    _state["phase"] = phase
    _state["processed"] = processed
    _state["total"] = total
    _state["current_tool"] = current_tool


def _run():
    from app.database import SessionLocal
    from app.scan_pipeline import run_full_cycle

    db = SessionLocal()
    try:
        _state["last_result"] = run_full_cycle(
            db, triggered_by="manual", on_progress=_on_progress, should_cancel=_should_cancel,
        )
        _state["last_error"] = None
        _state["cancelled"] = _state["cancel_requested"]
    except Exception as e:
        _state["last_error"] = str(e)
        _state["cancelled"] = False
    finally:
        db.close()
        _state["running"] = False
        _state["phase"] = "idle"
        _state["cancel_requested"] = False
        _state["finished_at"] = datetime.now().isoformat(timespec="seconds")


def start_manual_scan() -> bool:
    """Returns False (caller should respond 409) if a scan is already running."""
    if _state["running"]:
        return False
    _state["running"] = True
    _state["started_at"] = datetime.now().isoformat(timespec="seconds")
    _state["finished_at"] = None
    _state["phase"] = "starting"
    _state["processed"] = 0
    _state["total"] = 0
    _state["current_tool"] = None
    _state["cancel_requested"] = False
    _state["cancelled"] = False
    threading.Thread(target=_run, daemon=True).start()
    return True
