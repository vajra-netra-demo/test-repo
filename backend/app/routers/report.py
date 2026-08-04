import csv
import io
import os
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import SaaSTool, ScanSnapshot
from app.risk_engine import load_clauses
from app.evidence_report import generate_evidence_report, risk_level

router = APIRouter(prefix="/report", tags=["report"])

OUTPUT_DIR = Path(__file__).resolve().parent.parent.parent / "output"


@router.get("/evidence")
def get_evidence_report(tenant: str = "Sample Tenant Pvt Ltd", db: Session = Depends(get_db)):
    """Generates a fresh evidence report from current DB state and returns it as a download."""
    tools = db.query(SaaSTool).filter(SaaSTool.risk_score.isnot(None)).all()
    if not tools:
        raise HTTPException(status_code=409, detail="No risk-assessed tools found — run the Day 3 risk assessment first.")

    tool_dicts = [{
        "tool_name": t.tool_name,
        "department": t.department,
        "hosting_region": t.hosting_region,
        "data_categories_accessed": t.data_categories_accessed,
        "risk_score": t.risk_score,
        "risk_flags": t.risk_flags,
        "risk_reasoning": t.risk_reasoning,
    } for t in tools]

    mode = "REAL (Anthropic API)" if os.getenv("ANTHROPIC_API_KEY") else "MOCK (heuristic, no API key set)"

    OUTPUT_DIR.mkdir(exist_ok=True)
    output_path = OUTPUT_DIR / "netra_evidence_report.docx"
    generate_evidence_report(tenant, tool_dicts, load_clauses(), str(output_path), mode)

    return FileResponse(
        path=str(output_path),
        filename="netra_evidence_report.docx",
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


@router.get("/csv")
def get_csv_export(db: Session = Depends(get_db)):
    """Exports all discovered tools (assessed or not) as CSV for auditors/Excel."""
    tools = db.query(SaaSTool).order_by(SaaSTool.tool_name).all()
    if not tools:
        raise HTTPException(status_code=409, detail="No tools found — run seed/live-scan first.")

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
