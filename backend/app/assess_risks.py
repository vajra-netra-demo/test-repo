"""Day 3 — runs the risk engine (+ Triage Agent) over every tool in the DB.

Run with:  python -m app.assess_risks
Safe to re-run — re-assesses every tool each time.

Delegates to app.scan_pipeline.run_full_cycle, same as live_scan.py and the
API endpoint — kept as its own entry point since "assess_risks" is the
name used throughout Day 3 docs, but it's no longer a separate code path.

Uses a real LLM call if app/llm_provider.py is configured (ANTHROPIC_FOUNDRY_API_KEY
set), otherwise falls back to the transparent mock heuristics in risk_engine.py
and triage_agent.py.
"""

from app.database import SessionLocal
from app.llm_provider import is_configured as llm_configured
from app.scan_pipeline import run_full_cycle


def run():
    mode = "REAL" if llm_configured() else "MOCK (heuristic, no LLM configured)"
    print(f"Running risk assessment + triage in {mode} mode...")

    db = SessionLocal()
    try:
        result = run_full_cycle(db, triggered_by="manual")
        print(f"Assessed {result['total_tools']} tools ({result['live_ingested']} from live scan). "
              f"Readiness score: {result['readiness_score']}")
    finally:
        db.close()


if __name__ == "__main__":
    run()
