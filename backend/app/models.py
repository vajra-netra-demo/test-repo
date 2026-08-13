from sqlalchemy import Column, String, Integer, JSON, Text, Boolean

from app.database import Base


class User(Base):
    """Login accounts (app/auth.py). Two roles: "admin" (can trigger scans,
    remediate/auto-fix, offboard employees) and "viewer" (read-only). No
    self-registration — accounts are created directly (see app/auth.py's
    startup bootstrap of ADMIN_USERNAME/ADMIN_PASSWORD, or added to the DB
    by an admin)."""

    __tablename__ = "users"

    username = Column(String, primary_key=True)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False, default="viewer")  # "admin" | "viewer"


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

    # Fictional customer profile this tool belongs to, for the customer-story
    # selector (bfsi-bank / msme-exporter / govt-digital). Null for live-scanned
    # tools — they belong to the real GitHub org, not any fictional customer.
    tenant = Column(String, nullable=True, index=True)

    # Filled in by the Day 3 AI reasoning layer — null until then.
    risk_score = Column(Integer, nullable=True)
    risk_flags = Column(JSON, nullable=True)
    risk_reasoning = Column(Text, nullable=True)

    # Captured by scan_pipeline.py/tasks.py right before risk_score is
    # overwritten on each reassessment -- lets /discovery/risk-changes
    # surface "this tool's risk moved since the last scan" without a
    # separate history table. Null for a tool that's never been
    # reassessed a second time yet (nothing to compare against).
    previous_risk_score = Column(Integer, nullable=True)

    # Captured by scan_pipeline.py right before a live tool's row is
    # replaced on each discovery cycle -- lets /discovery/permission-changes
    # surface real permission creep (a tool that gained OAuth scopes it
    # didn't have last scan, without anyone re-approving it). Only ever set
    # for source="live" tools: sample data's scopes never change, and
    # endpoint-agent tool ids aren't stable enough across runs to diff
    # reliably (see routers/endpoint.py). Null means either never live-
    # discovered before, or (for sample/endpoint tools) not tracked.
    previous_oauth_scopes = Column(JSON, nullable=True)

    # Set via PATCH /tools/{id}/remediate once someone has acted on a finding.
    # A remediated tool's risk no longer counts against the readiness score.
    remediated = Column(Boolean, nullable=False, default=False)

    # Filled in by the Triage Agent (app/triage_agent.py): a recommendation,
    # never auto-executed — "auto-fix" only means "safe to one-click revoke",
    # a human still has to click it.
    triage_decision = Column(String, nullable=True)  # "auto-fix" | "manual-review" | "ignore"
    triage_reasoning = Column(Text, nullable=True)

    # Set for source="endpoint" rows (app/routers/endpoint.py) — which device
    # this browser-extension/installed-software finding was reported by.
    endpoint_device_id = Column(String, nullable=True, index=True)

    # DNS/GeoIP-derived hosting signal (app/network_intel.py) — a lighter,
    # honestly-labeled substitute for real network-tap capture. Null unless
    # a lookup has actually run for this tool.
    resolved_ip = Column(String, nullable=True)
    hosting_region_source = Column(String, nullable=False, default="declared")  # "declared" | "geoip-lookup" | "unknown"

    # Real TLS certificate read (app/network_intel.py::inspect_tls_certificate) —
    # a second, independent network-layer signal alongside DNS/GeoIP. Null
    # whenever the handshake fails or the cert carries no organizationName
    # (common for Let's Encrypt/DV certificates).
    tls_issuer_org = Column(String, nullable=True)
    tls_subject_org = Column(String, nullable=True)


class EndpointDevice(Base):
    """One row per device that has ever checked in via the endpoint discovery
    agent (netra-mvp/agent/netra_agent.py). Backs the per-employee/per-device
    dashboard view — distinct from SaaSTool, which is one row per *finding*,
    not per device."""

    __tablename__ = "endpoint_devices"

    id = Column(String, primary_key=True, index=True)  # stable device id the agent generates locally
    hostname = Column(String, nullable=False)
    os = Column(String, nullable=False)  # "windows" | "linux"
    employee = Column(String, nullable=True, index=True)
    department = Column(String, nullable=True)
    first_checkin = Column(String, nullable=False)
    last_checkin = Column(String, nullable=False)
    agent_version = Column(String, nullable=True)


class RedAgentFinding(Base):
    """One real MITRE ATT&CK technique execution reported by TriNetra's own
    Red Agent (netra-mvp/agent/red_agent.py) — a deliberately narrow,
    scoped attack-simulation counterpart to the passive discovery agents.

    Every technique the Red Agent can run belongs to the Discovery tactic
    only (see red_agent.py's TECHNIQUES list): read-only enumeration
    commands with no credential access, persistence, or lateral-movement
    capability. This table is an append-only log of real runs against a
    real, team-owned machine — one row per technique per run, grouped by
    run_id — not a claim of full adversary emulation. See
    app/attack_mapping.py's docstring for why this project deliberately
    stayed on the discovery side of the "attack simulation" line before;
    this table is the one narrow, explicit exception, and stays that way
    on purpose."""

    __tablename__ = "red_agent_findings"

    id = Column(String, primary_key=True, index=True)
    run_id = Column(String, nullable=False, index=True)
    hostname = Column(String, nullable=False)
    os = Column(String, nullable=False)
    technique_id = Column(String, nullable=False)
    technique_name = Column(String, nullable=False)
    tactic = Column(String, nullable=False)
    command = Column(String, nullable=False)
    output_snippet = Column(String, nullable=True)
    executed_at = Column(String, nullable=False)


class OffboardedEmployee(Base):
    """Marks an employee (matched by the free-text name reported by the
    endpoint agent, see EndpointDevice.employee) as departed, so their
    endpoint-discovered tool access can be flagged for review. There's no
    real HR/directory integration behind this — it's a manual admin action,
    consistent with the rest of the product never auto-executing anything
    a human hasn't confirmed."""

    __tablename__ = "offboarded_employees"

    employee = Column(String, primary_key=True)
    offboarded_date = Column(String, nullable=False)
    note = Column(String, nullable=True)


class ClassificationScan(Base):
    """One row per sensitive-data classification run (app/routers/classify.py).
    Same spirit as ScanSnapshot: a history log, not a live document store —
    `snippet` is truncated and exists only so a demo can show what was scanned,
    never the full original content."""

    __tablename__ = "classification_scans"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant = Column(String, nullable=True, index=True)
    label = Column(String, nullable=True)  # user-supplied name for the sample, e.g. "Loan Application Form"
    timestamp = Column(String, nullable=False, index=True)
    entity_counts = Column(JSON, nullable=False, default=dict)  # {"PAN": 2, "AADHAAR": 1, ...}
    sensitivity_score = Column(Integer, nullable=False, default=0)
    snippet = Column(Text, nullable=True)  # truncated, redacted preview only


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
    # Real wall-clock elapsed time for the scan+assess cycle itself (measured
    # via time.monotonic() in scan_pipeline.py, not derived from timestamp
    # strings) — null for snapshots recorded before this column existed.
    duration_seconds = Column(Integer, nullable=True)
