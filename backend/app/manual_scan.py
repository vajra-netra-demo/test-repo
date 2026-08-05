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
}


def get_manual_scan_status() -> dict:
    return dict(_state)


def _run():
    from app.database import SessionLocal
    from app.scan_pipeline import run_full_cycle

    db = SessionLocal()
    try:
        _state["last_result"] = run_full_cycle(db, triggered_by="manual")
        _state["last_error"] = None
    except Exception as e:
        _state["last_error"] = str(e)
    finally:
        db.close()
        _state["running"] = False
        _state["finished_at"] = datetime.now().isoformat(timespec="seconds")


def start_manual_scan() -> bool:
    """Returns False (caller should respond 409) if a scan is already running."""
    if _state["running"]:
        return False
    _state["running"] = True
    _state["started_at"] = datetime.now().isoformat(timespec="seconds")
    _state["finished_at"] = None
    threading.Thread(target=_run, daemon=True).start()
    return True
