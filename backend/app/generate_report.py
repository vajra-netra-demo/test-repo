"""Day 4 — CLI entry point for evidence-pack generation.

Run with:  python -m app.generate_report
Requires Day 3 to have run first (python -m app.assess_risks) so risk_score
is populated — tools without a risk_score are skipped with a warning.
"""

from pathlib import Path

from app.database import SessionLocal
from app.llm_provider import is_configured as llm_configured, PROVIDER, PROVIDER_REGION
from app.models import SaaSTool
from app.risk_engine import load_clauses
from app.evidence_report import generate_evidence_report

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "output"


def run(tenant_name: str = "Sample Tenant Pvt Ltd"):
    db = SessionLocal()
    try:
        all_tools = db.query(SaaSTool).all()
        assessed = [t for t in all_tools if t.risk_score is not None]
        skipped = len(all_tools) - len(assessed)
        if skipped:
            print(f"Warning: {skipped} tool(s) have no risk_score yet — run 'python -m app.assess_risks' first. Skipping them.")
        if not assessed:
            print("No assessed tools found. Run 'python -m app.assess_risks' first.")
            return

        tool_dicts = [{
            "tool_name": t.tool_name,
            "department": t.department,
            "hosting_region": t.hosting_region,
            "data_categories_accessed": t.data_categories_accessed,
            "risk_score": t.risk_score,
            "risk_flags": t.risk_flags,
            "risk_reasoning": t.risk_reasoning,
        } for t in assessed]

        mode = (
            f"REAL (Claude, via {PROVIDER} — {PROVIDER_REGION})" if llm_configured()
            else "MOCK (heuristic, no LLM configured)"
        )

        OUTPUT_DIR.mkdir(exist_ok=True)
        output_path = OUTPUT_DIR / "netra_evidence_report.docx"
        generate_evidence_report(tenant_name, tool_dicts, load_clauses(), str(output_path), mode)
        print(f"Evidence report written to {output_path}")
    finally:
        db.close()


if __name__ == "__main__":
    run()
