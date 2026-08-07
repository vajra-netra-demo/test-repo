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
trigger paths report into the same state on purpose. The same is true of
cancellation (request_cancel/_should_cancel below): a "Stop" button click
stops whichever scan is currently running, manual or scheduled — there's
no separate concept there either.
"""

import threading
from datetime import datetime, timezone
from typing import Optional

_state = {
    "running": False,
    "started_at": None,
    "finished_at": None,
    "last_result": None,
    "last_error": None,
    # Real per-tool progress, not a fake timer. "phase" is "starting" (before
    # counts are known), "discovering" (ingesting live tools), "assessing"
    # (risk assessment across every tool — the slower step, one real Claude
    # call per tool in REAL mode), or "cancelled" (a Stop request was
    # honored). current/total are 0 whenever the count for the current
    # phase isn't known yet.
    "phase": "idle",
    "current": 0,
    "total": 0,
    # True as soon as Stop is clicked, even before the running scan
    # actually notices — run_full_cycle only checks between tools, so a
    # real Claude call or Celery task already in flight still finishes.
    # Lets the UI show "Stopping…" instead of looking like the click did
    # nothing during that gap.
    "cancel_requested": False,
}

# threading.Event, not a plain bool: the running scan's background thread
# and this module's request_cancel() (called from the API request thread)
# need to see the same flag change reliably across threads.
_cancel_event = threading.Event()


def get_manual_scan_status() -> dict:
    return dict(_state)


def _report_progress(current: int, total: int, phase: str) -> None:
    _state["current"] = current
    _state["total"] = total
    _state["phase"] = phase


def _should_cancel() -> bool:
    return _cancel_event.is_set()


def request_cancel() -> bool:
    """Returns False (caller should respond 409) if no scan is running."""
    if not _state["running"]:
        return False
    _cancel_event.set()
    _state["cancel_requested"] = True
    return True


def _reset_for_start() -> None:
    _cancel_event.clear()
    _state["running"] = True
    _state["started_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    _state["finished_at"] = None
    _state["phase"] = "starting"
    _state["current"] = 0
    _state["total"] = 0
    _state["cancel_requested"] = False


def _reset_for_end() -> None:
    _state["running"] = False
    _state["phase"] = "idle"
    _state["current"] = 0
    _state["total"] = 0
    _state["cancel_requested"] = False
    _state["finished_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")


def _run():
    from app.database import SessionLocal
    from app.scan_pipeline import run_full_cycle

    db = SessionLocal()
    try:
        _state["last_result"] = run_full_cycle(
            db, triggered_by="manual", on_progress=_report_progress, should_cancel=_should_cancel,
        )
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


def cancel_checker():
    """Same idea as progress_reporter() above, for cancellation — handed to
    run_full_cycle(should_cancel=...) by scheduler.py so a Stop request
    interrupts a scheduler-triggered run too, not just a manual one."""
    return _should_cancel
