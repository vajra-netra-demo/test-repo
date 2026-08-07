"""Computes the current DPDP Readiness Score and records a ScanSnapshot row.

Called after every scan+assess cycle (manual button click or scheduled run)
so the dashboard can show a trend over time, not just the latest state.
"""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.models import SaaSTool, ScanSnapshot
from app.evidence_report import risk_level


def compute_readiness(db: Session):
    """Mirrors the dashboard's client-side formula exactly: 100 minus the
    average risk score across assessed tools, with remediated tools
    contributing 0."""
    assessed = db.query(SaaSTool).filter(SaaSTool.risk_score.isnot(None)).all()
    if not assessed:
        return None, {"High": 0, "Medium": 0, "Low": 0}, 0

    total_effective_risk = sum(0 if t.remediated else t.risk_score for t in assessed)
    avg_risk = total_effective_risk / len(assessed)
    score = round(100 - avg_risk)

    counts = {"High": 0, "Medium": 0, "Low": 0}
    for t in assessed:
        counts[risk_level(t.risk_score)] += 1

    return score, counts, len(assessed)


def record_snapshot(db: Session, triggered_by: str, duration_seconds: Optional[int] = None):
    score, counts, total = compute_readiness(db)
    snapshot = ScanSnapshot(
        # UTC-aware (explicit offset) so the frontend's Date parsing renders
        # it in each viewer's own local timezone instead of a raw server-
        # clock string — a Railway container's clock is UTC, so a naive
        # string here read literally can look hours off from IST.
        timestamp=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        triggered_by=triggered_by,
        readiness_score=score,
        total_tools=total,
        high_count=counts["High"],
        medium_count=counts["Medium"],
        low_count=counts["Low"],
        duration_seconds=duration_seconds,
    )
    db.add(snapshot)
    db.commit()
    return snapshot
