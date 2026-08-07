"""Single shared entry point for "do a full scan + assess cycle."

Used by the manual API endpoint, the CLI script, and the background
scheduler — so there is exactly one place that ties discovery and risk
assessment together, instead of three copies that can drift out of sync
(which is exactly how the earlier "blank risk score after live scan" bug
happened).
"""

import time
from typing import Callable, Optional

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


def run_full_cycle(
    db: Session,
    triggered_by: str = "manual",
    on_progress: Optional[Callable[[int, int, str], None]] = None,
    should_cancel: Optional[Callable[[], bool]] = None,
) -> dict:
    # Real per-tool progress for whoever's polling /discovery/scan-progress
    # (manual_scan.py's dashboard-facing state, or scheduler.py's automatic
    # runs) — optional and a no-op for every other caller (the CLI scripts,
    # tests) that has no progress UI to feed.
    def _report(current: int, total: int, phase: str) -> None:
        if on_progress:
            on_progress(current, total, phase)

    # Checked between tools, not mid-tool — a real Claude call already in
    # flight (REAL mode) or a Celery task already dispatched still finishes;
    # this stops the NEXT one from starting. Whatever's already been
    # written to the DB by the time this fires is kept, not rolled back —
    # partial real results, not discarded work.
    def _cancelled() -> bool:
        return bool(should_cancel and should_cancel())

    live_ingested = 0
    was_cancelled = False

    high_risk_live_findings = []

    if live_scan_configured():
        live_tools = fetch_live_tools()
        db.query(SaaSTool).filter(SaaSTool.source == "live").delete()
        total_live = len(live_tools)
        for i, record in enumerate(live_tools, start=1):
            if _cancelled():
                was_cancelled = True
                break

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
            live_ingested = i
            _report(i, total_live, "discovering")
        db.commit()

        if high_risk_live_findings:
            notify_high_risk_findings(high_risk_live_findings)

    # Re-assess every tool (sample + live + endpoint) so nothing is ever left stale.
    # Skipped entirely if cancelled during discovery above — Stop means stop,
    # not "finish discovering, then assess anyway."
    all_tools = db.query(SaaSTool).all()
    total_assess = len(all_tools)

    if was_cancelled:
        pass
    else:
        from app.tasks import is_configured as celery_configured
        if celery_configured() and all_tools:
            # Real parallel dispatch to a separate Celery worker process (see
            # app/tasks.py) instead of one-at-a-time in this process. Each task
            # commits its own row via its own DB session, so this session's
            # copies are stale afterward -- expire and re-fetch rather than
            # trust the in-memory `all_tools` objects.
            #
            # Real per-task progress: GroupResult.completed_count() reflects
            # each task's actual completion in the shared SQLite result
            # backend (tasks.py's db+sqlite backend) — a genuine cross-process
            # counter, not a fabricated increment. Polling it here (instead of
            # a single blocking job.get()) is what was missing before: without
            # it, this branch reported 0/total for the entire run and jumped
            # straight to total/total on completion — real progress, but with
            # nothing visible in between, which read as a frozen/stuck bar on
            # a large real deployment (258 tools) even though the scan itself
            # was progressing normally underneath.
            from celery import group
            from app.tasks import assess_and_store_tool

            _report(0, total_assess, "assessing")
            job = group(assess_and_store_tool.s(t.id) for t in all_tools).apply_async()
            deadline = time.monotonic() + 300
            while not job.ready() and time.monotonic() < deadline:
                if _cancelled():
                    # Best-effort: revokes queued tasks and asks the worker
                    # to terminate ones already running. Whatever's already
                    # committed by a task that finished before this fires
                    # stays — same "keep partial real progress" rule as the
                    # sequential path below.
                    job.revoke(terminate=True)
                    was_cancelled = True
                    break
                _report(min(job.completed_count(), total_assess), total_assess, "assessing")
                time.sleep(1)
            db.expire_all()
            all_tools = db.query(SaaSTool).all()
            if not was_cancelled:
                _report(total_assess, total_assess, "assessing")
        else:
            for i, t in enumerate(all_tools, start=1):
                if _cancelled():
                    was_cancelled = True
                    break
                risk = assess_tool(_tool_to_dict(t))
                t.previous_risk_score = t.risk_score
                t.risk_score = risk["risk_score"]
                t.risk_flags = risk["risk_flags"]
                t.risk_reasoning = risk["risk_reasoning"]

                triage_input = {**_tool_to_dict(t), **risk}
                triage = triage_tool(triage_input)
                t.triage_decision = triage["decision"]
                t.triage_reasoning = triage["reasoning"]
                _report(i, total_assess, "assessing")
            db.commit()

    # Push the complete current High-risk picture (every source, not just
    # newly-discovered live findings) into the real Sentinel workspace, so a
    # finding here is genuinely queryable there via KQL. Still real and
    # worth pushing even on a cancelled run — it's whatever's actually
    # been assessed so far, not a guess.
    high_risk_all = [
        {"tool_name": t.tool_name, "risk_score": t.risk_score, "risk_flags": t.risk_flags,
         "tenant": t.tenant, "source": t.source}
        for t in all_tools if (t.risk_score or 0) >= HIGH_RISK_THRESHOLD
    ]
    if high_risk_all:
        push_to_sentinel(high_risk_all)
        push_to_splunk(high_risk_all)

    snapshot = record_snapshot(db, f"{triggered_by} (cancelled)" if was_cancelled else triggered_by)

    if was_cancelled:
        _report(0, 0, "cancelled")

    return {
        "live_ingested": live_ingested,
        "total_tools": len(all_tools),
        "readiness_score": snapshot.readiness_score,
        "cancelled": was_cancelled,
    }
