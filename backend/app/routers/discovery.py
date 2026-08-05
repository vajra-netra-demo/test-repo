from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_admin
from app.database import get_db
from app.discovery_provider import is_configured, active_provider
from app.manual_scan import start_manual_scan, get_manual_scan_status
from app.models import SaaSTool
from app.scheduler import get_scheduler_status
from app.siem.sentinel_connector import is_configured as sentinel_is_configured
from app.siem.splunk_connector import is_configured as splunk_is_configured
from app.graph_analysis import compute_graph_insights

router = APIRouter(prefix="/discovery", tags=["discovery"], dependencies=[Depends(get_current_user)])


@router.get("/status")
def live_scan_status():
    return {
        "live_scan_configured": is_configured(),
        "provider": active_provider(),
        "scheduler": get_scheduler_status(),
        "sentinel_configured": sentinel_is_configured(),
        "splunk_configured": splunk_is_configured(),
    }


@router.get("/access-graph-insights")
def access_graph_insights(tenant: Optional[str] = None, db: Session = Depends(get_db)):
    """Real NetworkX graph metrics (app/graph_analysis.py) over currently
    discovered tools — degree/betweenness centrality and connected
    components, computed in-process on every request. Not a deployed graph
    database; see graph_analysis.py's module docstring for why."""
    query = db.query(SaaSTool)
    if tenant:
        query = query.filter(SaaSTool.tenant == tenant)
    tools = [
        {
            "tool_name": t.tool_name,
            "department": t.department,
            "data_categories_accessed": t.data_categories_accessed,
            "risk_score": t.risk_score,
        }
        for t in query.all()
    ]
    return compute_graph_insights(tools)


@router.post("/live-scan", dependencies=[Depends(require_admin)])
def trigger_live_scan():
    if not is_configured():
        raise HTTPException(
            status_code=409,
            detail="Live scan not configured — set GITHUB_TOKEN/GITHUB_ORG (preferred) or "
                   "MS_TENANT_ID/MS_CLIENT_ID/MS_CLIENT_SECRET in .env. See LIVE_SCAN_SETUP.md.",
        )
    # Runs in a background thread (see app/manual_scan.py) rather than inline —
    # with enough tools, one real Claude call per tool can take longer than
    # Railway's gateway timeout, which would otherwise kill this request
    # before the scan's final DB commit ever ran.
    if not start_manual_scan():
        raise HTTPException(status_code=409, detail="A scan is already in progress.")
    return {"status": "started"}


@router.get("/scan-progress")
def scan_progress():
    return get_manual_scan_status()
