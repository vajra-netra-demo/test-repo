from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.discovery_provider import is_configured, active_provider
from app.scan_pipeline import run_full_cycle
from app.scheduler import get_scheduler_status
from app.siem.sentinel_connector import is_configured as sentinel_is_configured

router = APIRouter(prefix="/discovery", tags=["discovery"])


@router.get("/status")
def live_scan_status():
    return {
        "live_scan_configured": is_configured(),
        "provider": active_provider(),
        "scheduler": get_scheduler_status(),
        "sentinel_configured": sentinel_is_configured(),
    }


@router.post("/live-scan")
def trigger_live_scan(db: Session = Depends(get_db)):
    if not is_configured():
        raise HTTPException(
            status_code=409,
            detail="Live scan not configured — set GITHUB_TOKEN/GITHUB_ORG (preferred) or "
                   "MS_TENANT_ID/MS_CLIENT_ID/MS_CLIENT_SECRET in .env. See LIVE_SCAN_SETUP.md.",
        )
    try:
        result = run_full_cycle(db, triggered_by="manual")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Live scan failed: {e}")
    return {"ingested": result["live_ingested"], "total_tools": result["total_tools"], "readiness_score": result["readiness_score"]}
