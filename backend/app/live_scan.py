"""Runs a live discovery scan against whichever provider is configured
(GitHub preferred, Microsoft Graph as fallback), ingests results as
SaaSTool rows tagged source="live", and re-assesses every tool. Also
records a ScanSnapshot for the readiness-score trend chart.

Does NOT touch existing source="sample" rows — live and sample tools
coexist so the demo can show both, or fall back to sample-only if live
scan isn't configured / has nothing interesting to find yet.

Delegates to app.scan_pipeline.run_full_cycle — the same function the API
endpoint and the background scheduler use, so there is exactly one place
that ties discovery and risk assessment together.

Run with:  python -m app.live_scan
"""

from app.database import Base, SessionLocal, engine
from app.discovery_provider import is_configured, active_provider
from app.scan_pipeline import run_full_cycle


def run():
    if not is_configured():
        print("Live scan not configured — set GITHUB_TOKEN/GITHUB_ORG (preferred) or")
        print("MS_TENANT_ID/MS_CLIENT_ID/MS_CLIENT_SECRET in .env. See LIVE_SCAN_SETUP.md.")
        print("Falling back to sample data only.")
        return

    provider = active_provider()
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        result = run_full_cycle(db, triggered_by="manual")
        print(f"Live scan complete via {provider}: ingested {result['live_ingested']} real tool(s).")
        print(f"Re-assessed {result['total_tools']} total tools. Readiness score: {result['readiness_score']}")
        if not result["live_ingested"]:
            print("No installed apps/grants found yet — connect a few test apps first (see LIVE_SCAN_SETUP.md).")
    finally:
        db.close()


if __name__ == "__main__":
    run()
