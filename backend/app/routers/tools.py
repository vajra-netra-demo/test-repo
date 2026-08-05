from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_admin
from app.database import get_db
from app.models import SaaSTool
from app.schemas import SaaSToolOut, RemediateRequest
from app.github_discovery import revoke_installation, is_configured as github_configured
from app.snapshot import record_snapshot

router = APIRouter(prefix="/tools", tags=["tools"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=List[SaaSToolOut])
def list_tools(
    department: Optional[str] = None,
    hosting_region: Optional[str] = None,
    source: Optional[str] = None,
    tenant: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(SaaSTool)
    if department:
        query = query.filter(SaaSTool.department == department)
    if hosting_region:
        query = query.filter(SaaSTool.hosting_region == hosting_region)
    if source:
        query = query.filter(SaaSTool.source == source)
    if tenant:
        query = query.filter(SaaSTool.tenant == tenant)
    return query.order_by(SaaSTool.tool_name).all()


@router.get("/{tool_id}", response_model=SaaSToolOut)
def get_tool(tool_id: str, db: Session = Depends(get_db)):
    tool = db.query(SaaSTool).filter(SaaSTool.id == tool_id).first()
    if not tool:
        raise HTTPException(status_code=404, detail=f"Tool '{tool_id}' not found")
    return tool


@router.patch("/{tool_id}/remediate", response_model=SaaSToolOut, dependencies=[Depends(require_admin)])
def set_remediated(tool_id: str, body: RemediateRequest, db: Session = Depends(get_db)):
    tool = db.query(SaaSTool).filter(SaaSTool.id == tool_id).first()
    if not tool:
        raise HTTPException(status_code=404, detail=f"Tool '{tool_id}' not found")
    tool.remediated = body.remediated
    db.commit()
    db.refresh(tool)
    return tool


@router.post("/{tool_id}/auto-fix", dependencies=[Depends(require_admin)])
def auto_fix_tool(tool_id: str, db: Session = Depends(get_db)):
    """Real, irreversible action: actually revokes a GitHub App's access on
    the live org via the GitHub API. Only supported for GitHub-sourced live
    tools (id starts with "live-gh-") — sample data and Microsoft-sourced
    tools have no real external system to act on, so they stay manual-only
    (PATCH /remediate).

    The frontend must show its own confirmation dialog before calling this
    — this endpoint does not ask again, it executes immediately."""
    tool = db.query(SaaSTool).filter(SaaSTool.id == tool_id).first()
    if not tool:
        raise HTTPException(status_code=404, detail=f"Tool '{tool_id}' not found")

    if tool.source != "live" or not tool.id.startswith("live-gh-"):
        raise HTTPException(
            status_code=400,
            detail="Auto-fix is only supported for GitHub-sourced live tools. "
                   "For sample data or other sources, use PATCH /tools/{id}/remediate instead.",
        )
    if not github_configured():
        raise HTTPException(status_code=409, detail="GitHub not configured — cannot auto-fix.")

    installation_id = tool.id.replace("live-gh-", "", 1)
    try:
        revoke_installation(installation_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to revoke access on GitHub: {e}")

    # The app's access is now genuinely gone — remove the row rather than
    # just flagging it, since a rescan would confirm it no longer exists.
    db.delete(tool)
    db.commit()
    snapshot = record_snapshot(db, triggered_by="manual")

    return {"revoked": True, "tool_id": tool_id, "readiness_score": snapshot.readiness_score}
