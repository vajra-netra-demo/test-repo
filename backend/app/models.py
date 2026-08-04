from sqlalchemy import Column, String, Integer, JSON, Text, Boolean

from app.database import Base


class SaaSTool(Base):
    """A discovered SaaS/AI tool and its access footprint.

    Populated from sample_saas_tools.json for the MVP (Day 1) since the
    team has no live Google Workspace / Microsoft Graph tenant access.
    risk_score/risk_flags/risk_reasoning are filled in by the Day 3 AI
    reasoning layer and stay null until then.
    """

    __tablename__ = "saas_tools"

    id = Column(String, primary_key=True, index=True)
    tool_name = Column(String, nullable=False)
    vendor = Column(String, nullable=False)
    category = Column(String, nullable=False)
    connected_via = Column(String, nullable=False)
    department = Column(String, nullable=False, index=True)
    connected_by_role = Column(String, nullable=False)
    first_connected = Column(String, nullable=False)
    last_used = Column(String, nullable=False)
    monthly_active_users = Column(Integer, nullable=False, default=0)
    oauth_scopes = Column(JSON, nullable=False, default=list)
    data_categories_accessed = Column(JSON, nullable=False, default=list)
    hosting_region = Column(String, nullable=False)

    # "sample" (Day 1 fake data) or "live" (real Microsoft Graph scan of the sandbox tenant)
    source = Column(String, nullable=False, default="sample")

    # Filled in by the Day 3 AI reasoning layer — null until then.
    risk_score = Column(Integer, nullable=True)
    risk_flags = Column(JSON, nullable=True)
    risk_reasoning = Column(Text, nullable=True)

    # Set via PATCH /tools/{id}/remediate once someone has acted on a finding.
    # A remediated tool's risk no longer counts against the readiness score.
    remediated = Column(Boolean, nullable=False, default=False)

    # Filled in by the Triage Agent (app/triage_agent.py): a recommendation,
    # never auto-executed — "auto-fix" only means "safe to one-click revoke",
    # a human still has to click it.
    triage_decision = Column(String, nullable=True)  # "auto-fix" | "manual-review" | "ignore"
    triage_reasoning = Column(Text, nullable=True)


class ScanSnapshot(Base):
    """One row per completed scan+assess cycle (manual or scheduled) — powers
    the readiness-score trend chart. `timestamp` is wall-clock text (ISO),
    stamped when the snapshot is written, not derived from tool data."""

    __tablename__ = "scan_snapshots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(String, nullable=False, index=True)
    triggered_by = Column(String, nullable=False)  # "manual" | "scheduled"
    readiness_score = Column(Integer, nullable=True)
    total_tools = Column(Integer, nullable=False, default=0)
    high_count = Column(Integer, nullable=False, default=0)
    medium_count = Column(Integer, nullable=False, default=0)
    low_count = Column(Integer, nullable=False, default=0)
