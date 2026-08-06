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
from app.network_intel import resolve_hosting_region
from app.snapshot import record_snapshot
from app.tool_utils import tool_to_dict as _tool_to_dict
from app.triage_agent import triage_tool
from app.slack_notify import notify_high_risk_findings
from app.siem.sentinel_connector import push_findings as push_to_sentinel
from app.siem.splunk_connector import push_findings as push_to_splunk

HIGH_RISK_THRESHOLD = 70


def run_full_cycle(db: Session, triggered_by: str = "manual") -> dict:
    live_ingested = 0

    high_risk_live_findings = []

    if live_scan_configured():
        live_tools = fetch_live_tools()
        db.query(SaaSTool).filter(SaaSTool.source == "live").delete()
        for record in live_tools:
            # Real DNS + IP geolocation on the app's own vendor/slug — an
            # honest substitute for real network-tap capture (see
            # app/network_intel.py). Only attempted for live tools, since
            # sample-data vendors are fictional and would just fail or
            # produce a misleading match.
            geo = resolve_hosting_region(record["vendor"])
            if geo["hosting_region"] != "Unknown":
                record["hosting_region"] = geo["hosting_region"]

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
                resolved_ip=geo["resolved_ip"], hosting_region_source=geo["hosting_region_source"],
                tls_issuer_org=geo.get("tls_issuer_org"), tls_subject_org=geo.get("tls_subject_org"),
            ))
            if risk["risk_score"] >= HIGH_RISK_THRESHOLD:
                high_risk_live_findings.append({
                    "tool_name": record["tool_name"],
                    "risk_score": risk["risk_score"],
                    "risk_flags": risk["risk_flags"],
                })
        live_ingested = len(live_tools)
        db.commit()

        if high_risk_live_findings:
            notify_high_risk_findings(high_risk_live_findings)

    # Re-assess every tool (sample + live + endpoint) so nothing is ever left stale.
    all_tools = db.query(SaaSTool).all()

    from app.tasks import is_configured as celery_configured
    if celery_configured() and all_tools:
        # Real parallel dispatch to a separate Celery worker process (see
        # app/tasks.py) instead of one-at-a-time in this process. Each task
        # commits its own row via its own DB session, so this session's
        # copies are stale afterward -- expire and re-fetch rather than
        # trust the in-memory `all_tools` objects.
        from celery import group
        from app.tasks import assess_and_store_tool

        job = group(assess_and_store_tool.s(t.id) for t in all_tools).apply_async()
        job.get(timeout=300, propagate=False)
        db.expire_all()
        all_tools = db.query(SaaSTool).all()
    else:
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

    # Push the complete current High-risk picture (every source, not just
    # newly-discovered live findings) into the real Sentinel workspace, so a
    # finding here is genuinely queryable there via KQL.
    high_risk_all = [
        {"tool_name": t.tool_name, "risk_score": t.risk_score, "risk_flags": t.risk_flags,
         "tenant": t.tenant, "source": t.source}
        for t in all_tools if (t.risk_score or 0) >= HIGH_RISK_THRESHOLD
    ]
    if high_risk_all:
        push_to_sentinel(high_risk_all)
        push_to_splunk(high_risk_all)

    snapshot = record_snapshot(db, triggered_by)

    return {
        "live_ingested": live_ingested,
        "total_tools": len(all_tools),
        "readiness_score": snapshot.readiness_score,
    }
