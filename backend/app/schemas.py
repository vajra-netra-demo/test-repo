from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class SaaSToolOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tool_name: str
    vendor: str
    category: str
    connected_via: str
    department: str
    connected_by_role: str
    first_connected: str
    last_used: str
    monthly_active_users: int
    oauth_scopes: List[str]
    data_categories_accessed: List[str]
    hosting_region: str
    source: str = "sample"
    tenant: Optional[str] = None
    risk_score: Optional[int] = None
    risk_flags: Optional[List[str]] = None
    risk_reasoning: Optional[str] = None
    remediated: bool = False
    triage_decision: Optional[str] = None
    triage_reasoning: Optional[str] = None
    endpoint_device_id: Optional[str] = None
    resolved_ip: Optional[str] = None
    hosting_region_source: str = "declared"
    tls_issuer_org: Optional[str] = None
    tls_subject_org: Optional[str] = None


class RemediateRequest(BaseModel):
    remediated: bool = True


class EndpointFinding(BaseModel):
    """One browser-extension or installed-software item reported by the
    endpoint agent (netra-mvp/agent/netra_agent.py)."""

    item_type: str  # "browser_extension" | "installed_software"
    name: str
    vendor: Optional[str] = None
    version: Optional[str] = None
    browser: Optional[str] = None  # for browser_extension items: "chrome" | "edge" | "firefox"
    permissions: List[str] = []
    install_date: Optional[str] = None


class EndpointReportRequest(BaseModel):
    device_id: str
    hostname: str
    os: str  # "windows" | "linux"
    employee: Optional[str] = None
    department: Optional[str] = None
    agent_version: Optional[str] = None
    findings: List[EndpointFinding] = []


class EndpointDeviceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    hostname: str
    os: str
    employee: Optional[str] = None
    department: Optional[str] = None
    first_checkin: str
    last_checkin: str
    agent_version: Optional[str] = None


class EmployeeSummary(BaseModel):
    employee: str
    department: Optional[str] = None
    device_count: int
    tool_count: int
    high_risk_count: int
    offboarded: bool = False
    offboarded_date: Optional[str] = None


class EmployeeProfile(BaseModel):
    employee: str
    devices: List[EndpointDeviceOut]
    tools: List[SaaSToolOut]
    offboarded: bool = False
    offboarded_date: Optional[str] = None
    offboard_note: Optional[str] = None


class OffboardRequest(BaseModel):
    note: Optional[str] = None


class ClassifyTextRequest(BaseModel):
    text: str
    label: Optional[str] = None
    tenant: Optional[str] = None


class ClassificationScanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant: Optional[str] = None
    label: Optional[str] = None
    timestamp: str
    entity_counts: dict
    sensitivity_score: int
    snippet: Optional[str] = None
