"""Triage Agent — decides what to do about each risk finding.

This is judgment, not another threshold score: given a tool's risk_score,
flags, and reasoning, it recommends one of:
  - "auto-fix"       : safe to one-click revoke (only ever true for
                        GitHub-sourced live tools, since that's the only
                        source we can actually act on for real)
  - "manual-review"  : a human should look at this before deciding
  - "ignore"         : not worth acting on right now

IMPORTANT — this agent only RECOMMENDS. It never calls revoke_installation()
itself. Executing a real, irreversible action against an external system
(GitHub) always stays a separate, explicitly human-confirmed step
(POST /tools/{id}/auto-fix, gated by a confirm() dialog in the UI). Turning
a recommendation into an unsupervised auto-execute would be a materially
different, riskier feature — not something to slide in silently.

Two modes, same pattern as risk_engine.py:
- REAL mode: calls Claude via Microsoft Foundry if ANTHROPIC_FOUNDRY_API_KEY is set.
- MOCK mode: transparent rule-based heuristic, clearly labeled.
"""

from app.llm_json import parse_llm_json


def build_prompt(tool: dict) -> str:
    return f"""You are a triage agent for a data-privacy risk platform. Given this already-assessed finding, decide what action to recommend.

FINDING:
- Tool: {tool.get('tool_name')}
- Source: {tool.get('source')} (only "live" tools sourced from GitHub can actually be auto-revoked for real)
- Risk score: {tool.get('risk_score')}/100
- Risk flags: {tool.get('risk_flags')}
- Risk reasoning: {tool.get('risk_reasoning')}
- Already remediated: {tool.get('remediated')}

Respond with ONLY a JSON object:
{{
  "decision": "auto-fix" | "manual-review" | "ignore",
  "confidence": "high" | "medium" | "low",
  "reasoning": "<1-2 plain-language sentences justifying the decision>"
}}

Only recommend "auto-fix" if source is a live GitHub-discovered tool AND you have high confidence
this is safe to revoke without human review (e.g. clearly dormant AND high risk). Otherwise prefer
"manual-review" for anything risky but ambiguous, and "ignore" for low-risk or already-handled findings."""


def _call_llm_real(prompt: str) -> dict:
    from app.llm_provider import call_llm

    return parse_llm_json(call_llm(prompt, max_tokens=300))


def _triage_mock(tool: dict) -> dict:
    """Transparent rule-based stand-in — used only when no API key is
    configured. Not an LLM call. Deliberately conservative: "auto-fix" is
    reserved for the clearest, highest-confidence cases only."""
    if tool.get("remediated"):
        return {
            "decision": "ignore",
            "confidence": "high",
            "reasoning": "[MOCK MODE — heuristic, not an LLM output] Already remediated — nothing further to do.",
        }

    score = tool.get("risk_score")
    if score is None:
        return {
            "decision": "manual-review",
            "confidence": "low",
            "reasoning": "[MOCK MODE — heuristic, not an LLM output] Not yet risk-assessed — needs a human to check once scored.",
        }

    flags = tool.get("risk_flags") or []
    is_github_live = tool.get("source") == "live" and str(tool.get("id", "")).startswith("live-gh-")

    if is_github_live and score >= 90 and "dormant-access" in flags:
        return {
            "decision": "auto-fix",
            "confidence": "high",
            "reasoning": (
                "[MOCK MODE — heuristic, not an LLM output] GitHub-sourced, very high risk score, and confirmed "
                "dormant — clearest safe-to-revoke case: nobody is using it, and the access it retains is severe."
            ),
        }

    if score >= 50:
        return {
            "decision": "manual-review",
            "confidence": "medium" if score >= 70 else "low",
            "reasoning": (
                "[MOCK MODE — heuristic, not an LLM output] Risk is real but not clear-cut enough to act on "
                "without a human decision — " + ("not GitHub-sourced, so no real auto-fix action exists." if not is_github_live
                else "doesn't meet the strict dormant+very-high-risk bar for auto-fix.")
            ),
        }

    return {
        "decision": "ignore",
        "confidence": "medium",
        "reasoning": "[MOCK MODE — heuristic, not an LLM output] Risk score is low enough that this isn't worth acting on right now.",
    }


def triage_tool(tool: dict) -> dict:
    from app.llm_provider import is_configured

    if is_configured():
        return _call_llm_real(build_prompt(tool))
    return _triage_mock(tool)
