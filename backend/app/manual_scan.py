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

This module's _state dict is also the shared progress store scheduler.py
writes into for its own automatic runs (see mark_scheduled_scan_start/end
below) — the dashboard's progress banner has no separate concept of
"started by the button" vs. "started by the interval timer," so both
trigger paths report into the same state on purpose.
"""

import threading
from datetime import datetime
from typing import Optional

_state = {
    "running": False,
    "started_at": None,
    "finished_at": None,
    "last_result": None,
    "last_error": None,
    # Real per-tool progress, not a fake timer. "phase" is "starting" (before
    # counts are known), "discovering" (ingesting live tools) or "assessing"
    # (risk assessment across every tool — the slower step, one real Claude
    # call per tool in REAL mode). current/total are 0 whenever the count
    # for the current phase isn't known yet.
    "phase": "idle",
    "current": 0,
    "total": 0,
}


def get_manual_scan_status() -> dict:
    return dict(_state)


def _report_progress(current: int, total: int, phase: str) -> None:
    _state["current"] = current
    _state["total"] = total
    _state["phase"] = phase


def _reset_for_start() -> None:
    _state["running"] = True
    _state["started_at"] = datetime.now().isoformat(timespec="seconds")
    _state["finished_at"] = None
    _state["phase"] = "starting"
    _state["current"] = 0
    _state["total"] = 0


def _reset_for_end() -> None:
    _state["running"] = False
    _state["phase"] = "idle"
    _state["current"] = 0
    _state["total"] = 0
    _state["finished_at"] = datetime.now().isoformat(timespec="seconds")


def _run():
    from app.database import SessionLocal
    from app.scan_pipeline import run_full_cycle

    db = SessionLocal()
    try:
        _state["last_result"] = run_full_cycle(db, triggered_by="manual", on_progress=_report_progress)
        _state["last_error"] = None
    except Exception as e:
        _state["last_error"] = str(e)
    finally:
        db.close()
        _reset_for_end()


def start_manual_scan() -> bool:
    """Returns False (caller should respond 409) if a scan is already running."""
    if _state["running"]:
        return False
    _reset_for_start()
    threading.Thread(target=_run, daemon=True).start()
    return True


def mark_scheduled_scan_start() -> None:
    """Called by scheduler.py right before its own automatic cycle, so a
    scheduler-triggered run shows up in /discovery/scan-progress exactly
    like a manual one — see this module's docstring for why."""
    _reset_for_start()


def mark_scheduled_scan_end(result: Optional[dict] = None, error: Optional[str] = None) -> None:
    _state["last_result"] = result
    _state["last_error"] = error
    _reset_for_end()


def progress_reporter():
    """Handed to run_full_cycle(on_progress=...) by scheduler.py — a plain
    function reference to this module's own _report_progress, so both
    trigger paths update the identical shared state."""
    return _report_progress
