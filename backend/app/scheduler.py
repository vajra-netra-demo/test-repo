"""Background scheduler — periodically re-runs the full scan+assess cycle
so the dashboard reflects "continuous monitoring," not a one-time snapshot.
Runs as a daemon thread inside the same process as the API server; no
external job queue or cron needed for the demo.

Set SCAN_INTERVAL_SECONDS=0 in .env to disable.
"""

import threading
import time
from datetime import datetime

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

    while True:
        time.sleep(_state["interval_seconds"])
        db = SessionLocal()
        try:
            run_full_cycle(db, triggered_by="scheduled")
            _state["last_status"] = "ok"
        except Exception as e:
            _state["last_status"] = f"error: {e}"
        finally:
            db.close()
            _state["run_count"] += 1
            _state["last_run"] = datetime.now().isoformat(timespec="seconds")


def start_scheduler():
    global _started
    if _started or not _state["enabled"]:
        return
    _started = True
    thread = threading.Thread(target=_loop, daemon=True)
    thread.start()
