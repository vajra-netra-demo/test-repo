"""Single shared entry point for "do a full scan + assess cycle."

Used by the manual API endpoint, the CLI script, and the background
scheduler — so there is exactly one place that ties discovery and risk
assessment together, instead of three copies that can drift out of sync
(which is exactly how the earlier "blank risk score after live scan" bug
happened).
"""

from sqlalchemy.orm import Session

from app.models import SaaSTool
from app.risk_engine import assess_tool
from app.discovery_provider import fetch_live_tools, is_configured as live_scan_configured
from app.snapshot import record_snapshot
from app.triage_agent import triage_tool


def _tool_to_dict(t: SaaSTool) -> dict:
    return {
        "id": t.id, "tool_name": t.tool_name, "vendor": t.vendor, "category": t.category,
        "connected_via": t.connected_via, "department": t.department, "connected_by_role": t.connected_by_role,
        "first_connected": t.first_connected, "last_used": t.last_used,
        "monthly_active_users": t.monthly_active_users, "oauth_scopes": t.oauth_scopes,
        "data_categories_accessed": t.data_categories_accessed, "hosting_region": t.hosting_region,
        "source": t.source, "remediated": t.remediated,
    }


def run_full_cycle(db: Session, triggered_by: str = "manual") -> dict:
    live_ingested = 0

    if live_scan_configured():
        live_tools = fetch_live_tools()
        db.query(SaaSTool).filter(SaaSTool.source == "live").delete()
        for record in live_tools:
            risk = assess_tool(record)
            triage_input = {**record, "source": "live", "remediated": False, **risk}
            triage = triage_tool(triage_input)
            db.add(SaaSTool(
                id=record["id"], tool_name=record["tool_name"], vendor=record["vendor"],
                category=record["category"], connected_via=record["connected_via"],
                department=record["department"], connected_by_role=record["connected_by_role"],
                first_connected=record["first_connected"], last_used=record["last_used"],
                monthly_active_users=record["monthly_active_users"], oauth_scopes=record["oauth_scopes"],
                data_categories_accessed=record["data_categories_accessed"], hosting_region=record["hosting_region"],
                source="live",
                risk_score=risk["risk_score"], risk_flags=risk["risk_flags"], risk_reasoning=risk["risk_reasoning"],
                triage_decision=triage["decision"], triage_reasoning=triage["reasoning"],
            ))
        live_ingested = len(live_tools)
        db.commit()

    # Re-assess every tool (sample + live) so nothing is ever left stale.
    all_tools = db.query(SaaSTool).all()
    for t in all_tools:
        risk = assess_tool(_tool_to_dict(t))
        t.risk_score = risk["risk_score"]
        t.risk_flags = risk["risk_flags"]
        t.risk_reasoning = risk["risk_reasoning"]

        triage_input = {**_tool_to_dict(t), **risk}
        triage = triage_tool(triage_input)
        t.triage_decision = triage["decision"]
        t.triage_reasoning = triage["reasoning"]
    db.commit()

    snapshot = record_snapshot(db, triggered_by)

    return {
        "live_ingested": live_ingested,
        "total_tools": len(all_tools),
        "readiness_score": snapshot.readiness_score,
    }
