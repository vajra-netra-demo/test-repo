"""Day 3 — runs the risk engine (+ Triage Agent) over every tool in the DB.

Run with:  python -m app.assess_risks
Safe to re-run — re-assesses every tool each time.

Delegates to app.scan_pipeline.run_full_cycle, same as live_scan.py and the
API endpoint — kept as its own entry point since "assess_risks" is the
name used throughout Day 3 docs, but it's no longer a separate code path.

Uses a real LLM call if ANTHROPIC_API_KEY is set in the environment,
otherwise falls back to the transparent mock heuristics in risk_engine.py
and triage_agent.py.
"""

import os

from app.database import SessionLocal
from app.scan_pipeline import run_full_cycle


def run():
    mode = "REAL (Anthropic API)" if os.getenv("ANTHROPIC_API_KEY") else "MOCK (heuristic, no API key set)"
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
