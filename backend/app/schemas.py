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
    risk_score: Optional[int] = None
    risk_flags: Optional[List[str]] = None
    risk_reasoning: Optional[str] = None
    remediated: bool = False
    triage_decision: Optional[str] = None
    triage_reasoning: Optional[str] = None


class RemediateRequest(BaseModel):
    remediated: bool = True
