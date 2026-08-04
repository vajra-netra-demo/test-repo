import csv
import io
import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.llm_provider import is_configured as llm_configured, PROVIDER, PROVIDER_REGION
from app.models import SaaSTool, ScanSnapshot
from app.risk_engine import load_clauses
from app.evidence_report import generate_evidence_report, risk_level

router = APIRouter(prefix="/report", tags=["report"])

OUTPUT_DIR = Path(__file__).resolve().parent.parent.parent / "output"
PROFILES_FILE = Path(__file__).resolve().parent.parent.parent / "data" / "customer_profiles.json"


def _resolve_tenant_name(tenant_id: str) -> str:
    """Looks up the real customer-story name for a tenant id, falling back to
    the generic sample tenant name if unrecognized or not provided."""
    if not tenant_id:
        return "Sample Tenant Pvt Ltd"
    with open(PROFILES_FILE, "r", encoding="utf-8") as f:
        profiles = json.load(f)["profiles"]
    match = next((p for p in profiles if p["id"] == tenant_id), None)
    return match["name"] if match else "Sample Tenant Pvt Ltd"


@router.get("/evidence")
def get_evidence_report(tenant_id: str = None, db: Session = Depends(get_db)):
    """Generates a fresh evidence report from current DB state and returns it
    as a download. Pass tenant_id (e.g. "bfsi-bank") to scope the report to
    one customer-story profile and use its real name as the report title."""
    query = db.query(SaaSTool).filter(SaaSTool.risk_score.isnot(None))
    if tenant_id:
        query = query.filter(SaaSTool.tenant == tenant_id)
    tools = query.all()
    if not tools:
        raise HTTPException(status_code=409, detail="No risk-assessed tools found for this selection — run the Day 3 risk assessment first.")

    tenant_name = _resolve_tenant_name(tenant_id)

    tool_dicts = [{
        "tool_name": t.tool_name,
        "department": t.department,
        "hosting_region": t.hosting_region,
        "data_categories_accessed": t.data_categories_accessed,
        "risk_score": t.risk_score,
        "risk_flags": t.risk_flags,
        "risk_reasoning": t.risk_reasoning,
    } for t in tools]

    mode = (
        f"REAL (Claude, via {PROVIDER} — {PROVIDER_REGION})" if llm_configured()
        else "MOCK (heuristic, no LLM configured)"
    )

    OUTPUT_DIR.mkdir(exist_ok=True)
    output_path = OUTPUT_DIR / "netra_evidence_report.docx"
    generate_evidence_report(tenant_name, tool_dicts, load_clauses(), str(output_path), mode)

    return FileResponse(
        path=str(output_path),
        filename="netra_evidence_report.docx",
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


@router.get("/csv")
def get_csv_export(tenant_id: str = None, db: Session = Depends(get_db)):
    """Exports all discovered tools (assessed or not) as CSV for auditors/Excel.
    Pass tenant_id to scope to one customer-story profile."""
    query = db.query(SaaSTool)
    if tenant_id:
        query = query.filter(SaaSTool.tenant == tenant_id)
    tools = query.order_by(SaaSTool.tool_name).all()
    if not tools:
        raise HTTPException(status_code=409, detail="No tools found for this selection.")

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([
        "Tool Name", "Vendor", "Category", "Department", "Source", "Hosting Region",
        "OAuth Scopes", "Data Categories Accessed", "Risk Level", "Risk Score",
        "Risk Flags", "Risk Reasoning", "Remediated", "First Connected", "Last Used",
    ])
    for t in tools:
        writer.writerow([
            t.tool_name, t.vendor, t.category, t.department, t.source, t.hosting_region,
            "; ".join(t.oauth_scopes or []), "; ".join(t.data_categories_accessed or []),
            risk_level(t.risk_score) if t.risk_score is not None else "Not assessed",
            t.risk_score if t.risk_score is not None else "",
            "; ".join(t.risk_flags or []), t.risk_reasoning or "",
            "Yes" if t.remediated else "No", t.first_connected, t.last_used,
        ])

    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=netra_discovered_tools.csv"},
    )


@router.get("/history")
def get_scan_history(limit: int = 50, db: Session = Depends(get_db)):
    """Readiness-score trend — one point per completed scan+assess cycle."""
    snapshots = db.query(ScanSnapshot).order_by(ScanSnapshot.id.desc()).limit(limit).all()
    return [{
        "timestamp": s.timestamp,
        "triggered_by": s.triggered_by,
        "readiness_score": s.readiness_score,
        "total_tools": s.total_tools,
        "high_count": s.high_count,
        "medium_count": s.medium_count,
        "low_count": s.low_count,
    } for s in reversed(snapshots)]
