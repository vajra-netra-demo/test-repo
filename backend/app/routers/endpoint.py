"""Ingestion endpoint for the endpoint discovery agent
(netra-mvp/agent/netra_agent.py) — the read-only, per-device counterpart to
github_discovery.py's org-level OAuth discovery.

Deliberately read-only: this router only ever writes SaaSTool/EndpointDevice
rows describing what an agent found. There is no push-install or block
capability here — that needs signed installers and a real device fleet to
test against, which is out of scope for this build (see the mentor-session
notes in the handover doc).

Auth is a single shared bearer token (ENDPOINT_AGENT_TOKEN) rather than
per-device credentials — proportionate to a read-only reporting endpoint,
not a system that can act on anything.
"""

from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.config import ENDPOINT_AGENT_TOKEN
from app.database import get_db
from app.models import EndpointDevice, SaaSTool
from app.schemas import EndpointDeviceOut, EndpointReportRequest

router = APIRouter(prefix="/discovery", tags=["endpoint"])


def _check_token(authorization: str = Header(default="")):
    if not ENDPOINT_AGENT_TOKEN:
        raise HTTPException(status_code=503, detail="Endpoint agent ingestion is not configured (ENDPOINT_AGENT_TOKEN unset).")
    expected = f"Bearer {ENDPOINT_AGENT_TOKEN}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing agent token.")


def _tool_id_for(device_id: str, finding_index: int) -> str:
    return f"endpoint-{device_id}-{finding_index}"


@router.post("/endpoint-report")
def submit_endpoint_report(
    body: EndpointReportRequest,
    db: Session = Depends(get_db),
    _: None = Depends(_check_token),
):
    now = datetime.now().isoformat(timespec="seconds")

    device = db.query(EndpointDevice).filter(EndpointDevice.id == body.device_id).first()
    if device:
        device.hostname = body.hostname
        device.os = body.os
        device.employee = body.employee
        device.department = body.department
        device.agent_version = body.agent_version
        device.last_checkin = now
    else:
        device = EndpointDevice(
            id=body.device_id, hostname=body.hostname, os=body.os,
            employee=body.employee, department=body.department,
            first_checkin=now, last_checkin=now, agent_version=body.agent_version,
        )
        db.add(device)

    # Replace this device's prior findings wholesale each check-in — the
    # agent always reports its full current inventory, not a diff, so a
    # stale row (an extension that was since removed) should disappear.
    db.query(SaaSTool).filter(SaaSTool.endpoint_device_id == body.device_id).delete()

    for i, finding in enumerate(body.findings):
        db.add(SaaSTool(
            id=_tool_id_for(body.device_id, i),
            tool_name=finding.name,
            vendor=finding.vendor or finding.browser or "Unknown",
            category="Browser Extension" if finding.item_type == "browser_extension" else "Installed Software",
            connected_via=finding.browser or body.os,
            department=body.department or "Unassigned",
            connected_by_role=body.employee or "Unknown",
            first_connected=(finding.install_date or now[:10]),
            last_used=now[:10],
            monthly_active_users=1,
            oauth_scopes=finding.permissions,
            data_categories_accessed=finding.permissions,
            hosting_region="Unknown (endpoint-discovered — not a cloud OAuth grant)",
            source="endpoint",
            endpoint_device_id=body.device_id,
        ))

    db.commit()
    return {"device_id": body.device_id, "findings_ingested": len(body.findings)}


@router.get("/endpoints", response_model=List[EndpointDeviceOut])
def list_endpoints(db: Session = Depends(get_db)):
    return db.query(EndpointDevice).order_by(EndpointDevice.last_checkin.desc()).all()
