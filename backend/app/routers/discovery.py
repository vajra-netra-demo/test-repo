from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user, require_admin
from app.discovery_provider import is_configured, active_provider
from app.manual_scan import start_manual_scan, get_manual_scan_status
from app.scheduler import get_scheduler_status
from app.siem.sentinel_connector import is_configured as sentinel_is_configured

router = APIRouter(prefix="/discovery", tags=["discovery"], dependencies=[Depends(get_current_user)])


@router.get("/status")
def live_scan_status():
    return {
        "live_scan_configured": is_configured(),
        "provider": active_provider(),
        "scheduler": get_scheduler_status(),
        "sentinel_configured": sentinel_is_configured(),
    }


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
