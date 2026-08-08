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

from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_admin
from app.config import ENDPOINT_AGENT_TOKEN
from app.database import get_db
from app.models import EndpointDevice, OffboardedEmployee, SaaSTool
from app.schemas import (
    EmployeeProfile,
    EmployeeSummary,
    EndpointDeviceOut,
    EndpointReportRequest,
    OffboardRequest,
)

router = APIRouter(prefix="/discovery", tags=["endpoint"])

OFFBOARD_FLAG = "employee-offboarded-access-pending-revocation"


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
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")

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

    # Newly-ingested findings land with no risk_score: unlike live-discovered
    # (GitHub) tools, which get assessed inline as part of run_full_cycle's
    # own discovery loop, endpoint findings arrive through this separate
    # HTTP endpoint entirely outside that cycle. Scoring hundreds of
    # findings with a real LLM call each, synchronously, inside this
    # request would hang the agent for a very long time (and risk the same
    # gateway-timeout failure manual_scan.py's docstring already describes
    # for full scans) — so instead this just kicks the same background scan
    # the dashboard's "Run Live Scan" button uses. A scan already in flight
    # is left alone (start_manual_scan() no-ops) since it will pick up
    # these rows anyway via its own fresh query.
    from app.manual_scan import start_manual_scan
    start_manual_scan()

    return {"device_id": body.device_id, "findings_ingested": len(body.findings)}


@router.get("/endpoints", response_model=List[EndpointDeviceOut], dependencies=[Depends(get_current_user)])
def list_endpoints(db: Session = Depends(get_db)):
    return db.query(EndpointDevice).order_by(EndpointDevice.last_checkin.desc()).all()


def _device_ids_for(db: Session, employee: str) -> List[str]:
    return [d.id for d in db.query(EndpointDevice).filter(EndpointDevice.employee == employee).all()]


@router.get("/employees", response_model=List[EmployeeSummary], dependencies=[Depends(get_current_user)])
def list_employees(db: Session = Depends(get_db)):
    """One row per distinct employee name reported by the endpoint agent —
    there's no separate employee directory, this is derived entirely from
    EndpointDevice.employee, the only place a real name exists in this data
    model (OAuth/live/sample tools only carry a role, e.g. "HR Executive",
    never a specific person)."""
    devices = db.query(EndpointDevice).filter(EndpointDevice.employee.isnot(None)).all()
    offboarded = {o.employee: o for o in db.query(OffboardedEmployee).all()}

    by_employee: dict = {}
    for d in devices:
        entry = by_employee.setdefault(d.employee, {"department": d.department, "device_ids": []})
        entry["device_ids"].append(d.id)

    summaries = []
    for employee, info in by_employee.items():
        tools = db.query(SaaSTool).filter(SaaSTool.endpoint_device_id.in_(info["device_ids"])).all()
        high_risk = sum(1 for t in tools if (t.risk_score or 0) >= 70)
        ob = offboarded.get(employee)
        summaries.append(EmployeeSummary(
            employee=employee, department=info["department"],
            device_count=len(info["device_ids"]), tool_count=len(tools),
            high_risk_count=high_risk,
            offboarded=ob is not None, offboarded_date=ob.offboarded_date if ob else None,
        ))
    return sorted(summaries, key=lambda s: s.employee)


@router.get("/employees/{employee}/profile", response_model=EmployeeProfile, dependencies=[Depends(get_current_user)])
def employee_profile(employee: str, db: Session = Depends(get_db)):
    device_ids = _device_ids_for(db, employee)
    if not device_ids:
        raise HTTPException(status_code=404, detail=f"No devices found for employee '{employee}'.")

    devices = db.query(EndpointDevice).filter(EndpointDevice.employee == employee).all()
    tools = db.query(SaaSTool).filter(SaaSTool.endpoint_device_id.in_(device_ids)).order_by(SaaSTool.risk_score.desc().nullslast()).all()
    ob = db.query(OffboardedEmployee).filter(OffboardedEmployee.employee == employee).first()

    return EmployeeProfile(
        employee=employee, devices=devices, tools=tools,
        offboarded=ob is not None,
        offboarded_date=ob.offboarded_date if ob else None,
        offboard_note=ob.note if ob else None,
    )


@router.post("/employees/{employee}/offboard", response_model=EmployeeProfile, dependencies=[Depends(require_admin)])
def offboard_employee(employee: str, body: OffboardRequest, db: Session = Depends(get_db)):
    """Marks an employee departed and immediately flags every endpoint-
    discovered tool tied to their device(s) for review. Deliberately does
    NOT auto-revoke anything — same human-in-the-loop philosophy as the
    Triage Agent elsewhere in this product; a person still has to act on
    each flagged tool (Mark as Remediated / Auto-Fix where available)."""
    device_ids = _device_ids_for(db, employee)
    if not device_ids:
        raise HTTPException(status_code=404, detail=f"No devices found for employee '{employee}'.")

    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    existing = db.query(OffboardedEmployee).filter(OffboardedEmployee.employee == employee).first()
    if existing:
        existing.offboarded_date = now
        existing.note = body.note
    else:
        db.add(OffboardedEmployee(employee=employee, offboarded_date=now, note=body.note))

    tools = db.query(SaaSTool).filter(SaaSTool.endpoint_device_id.in_(device_ids)).all()
    for t in tools:
        flags = list(t.risk_flags or [])
        if OFFBOARD_FLAG not in flags:
            flags.append(OFFBOARD_FLAG)
        t.risk_flags = flags
        t.risk_score = max(t.risk_score or 0, 90)
        t.triage_decision = "manual-review"
        t.triage_reasoning = (
            f"Employee '{employee}' was marked offboarded on {now[:10]}. This tool was discovered on their "
            "device and its access has not yet been confirmed revoked — flagged for immediate review."
        )

    db.commit()
    return employee_profile(employee, db)


@router.delete("/employees/{employee}/offboard", response_model=EmployeeProfile, dependencies=[Depends(require_admin)])
def undo_offboard_employee(employee: str, db: Session = Depends(get_db)):
    """Undoes an offboarding mark — for demo repeatability, not a real
    rehire workflow. Leaves the risk flags/score in place (they were a
    real finding at the time); only removes the offboarded-employee record."""
    existing = db.query(OffboardedEmployee).filter(OffboardedEmployee.employee == employee).first()
    if not existing:
        raise HTTPException(status_code=404, detail=f"'{employee}' is not currently marked offboarded.")
    db.delete(existing)
    db.commit()
    return employee_profile(employee, db)
