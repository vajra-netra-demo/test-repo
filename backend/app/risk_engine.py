"""Day 3 — AI reasoning layer.

Reads each tool's access footprint, cross-references the curated
regulatory clause set, and produces a risk_score / risk_flags /
risk_reasoning triple.

Two modes:
- REAL mode: calls the Anthropic API if ANTHROPIC_API_KEY is set.
- MOCK mode: a transparent, rule-based heuristic used when no API key is
  configured, so the ingest -> reason -> store -> serve pipeline can be
  proven end-to-end without live credentials. Every mock result is
  labeled so it's never mistaken for a real model output.
"""

import json
import os
from datetime import datetime, date
from pathlib import Path

CLAUSES_FILE = Path(__file__).resolve().parent.parent.parent / "data" / "regulatory_clauses.json"

BROAD_SCOPE_MARKERS = [
    "readwrite.all", "mail.send", "auth/drive\"", "gmail.modify",
    "full", "all files", "tenant-wide",
    # GitHub-style permission scopes (e.g. "administration:read", "organization_administration:read")
    "administration", "organization_administration",
]

# Provider-agnostic signal: many distinct granted permissions is itself a
# breadth-of-access red flag, regardless of the specific scope vocabulary
# (Microsoft Graph and GitHub name permissions very differently).
MANY_SCOPES_THRESHOLD = 8


def load_clauses():
    with open(CLAUSES_FILE, "r", encoding="utf-8") as f:
        return json.load(f)["clauses"]


def _days_since(date_str: str):
    """Returns days since date_str, or None if it isn't a real date —
    live-scan tools carry a placeholder string here (see live_discovery.py)
    since Graph's free tier doesn't expose usage history."""
    try:
        d = datetime.strptime(date_str, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None
    return (date.today() - d).days


def _has_broad_scope(tool: dict) -> bool:
    scopes = tool.get("oauth_scopes", [])
    joined = " ".join(scopes).lower()
    if any(marker in joined for marker in BROAD_SCOPE_MARKERS):
        return True
    return len(scopes) >= MANY_SCOPES_THRESHOLD


def build_prompt(tool: dict, clauses: list) -> str:
    clause_text = "\n".join(f"- [{c['id']}] ({c['framework']}) {c['topic']}: {c['summary']}" for c in clauses)
    return f"""You are a data-privacy risk analyst. Assess this discovered SaaS tool's access footprint against the regulatory clauses below, from an Indian company's compliance perspective.

TOOL:
{json.dumps(tool, indent=2)}

REGULATORY CLAUSES:
{clause_text}

Respond with ONLY a JSON object, no other text, in this exact shape:
{{
  "risk_score": <integer 0-100, higher = riskier>,
  "risk_flags": [<short string tags, e.g. "dormant-access", "foreign-hosted", "over-broad-scope">],
  "risk_reasoning": "<2-3 plain-language sentences explaining the risk and citing the relevant clause id(s) in brackets>"
}}"""


def call_llm_real(prompt: str) -> dict:
    """Calls the Anthropic API. Only invoked when ANTHROPIC_API_KEY is set."""
    import anthropic  # lazy import — only required when this path actually runs

    client = anthropic.Anthropic()
    response = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=400,
        messages=[{"role": "user", "content": prompt}],
    )
    text = response.content[0].text.strip()
    return json.loads(text)


def call_llm_mock(tool: dict, clauses: list) -> dict:
    """Transparent rule-based stand-in — used only when no API key is configured.

    Not an LLM call. Exists to prove the pipeline wiring (ingest -> reason ->
    store -> serve) end-to-end before a real API key is available.
    """
    flags = []
    cited = []
    score = 10

    if tool.get("monthly_active_users", 0) == 0:
        days_idle = _days_since(tool["last_used"])
        if days_idle is not None and days_idle > 180:
            flags.append("dormant-access")
            cited.append("RBI-ACCESS-REVIEW")
            cited.append("IRDAI-VENDOR-RISK")
            score += 35
        elif days_idle is None:
            flags.append("usage-unknown")
            cited.append("RBI-ACCESS-REVIEW")
            score += 15

    if _has_broad_scope(tool):
        flags.append("over-broad-scope")
        cited.append("DPDP-MIN")
        cited.append("SEC-LEAST-PRIV")
        cited.append("SEBI-VENDOR-RISK")
        score += 30

    region = tool.get("hosting_region", "")
    if region != "India":
        is_known_foreign = region not in ("India",) and not region.startswith("Unknown")
        flags.append("foreign-hosted" if is_known_foreign else "unknown-hosting")
        cited.append("DPDP-XBORDER")
        cited.append("DPDP-PROCESSOR")
        cited.append("IRDAI-LOCALIZATION")
        cited.append("SEBI-SBOM")
        score += 20 if is_known_foreign else 30

    score = min(score, 100)
    cited = sorted(set(cited))

    if not flags:
        reasoning = (
            "No significant risk indicators found: access is narrowly scoped, the tool is actively used, "
            "and it is hosted within India."
        )
    else:
        parts = []
        if "dormant-access" in flags:
            parts.append(f"the tool has not been used in over 180 days yet retains its original access [RBI-ACCESS-REVIEW][IRDAI-VENDOR-RISK]")
        if "usage-unknown" in flags:
            parts.append(f"its actual usage cannot currently be verified, which itself is a visibility gap [RBI-ACCESS-REVIEW]")
        if "over-broad-scope" in flags:
            parts.append(f"its granted permissions are broader than a single-purpose tool should need [DPDP-MIN][SEC-LEAST-PRIV][SEBI-VENDOR-RISK]")
        if "foreign-hosted" in flags or "unknown-hosting" in flags:
            parts.append(f"it is hosted outside India (or hosting location is unverified), creating a cross-border processing question [DPDP-XBORDER][DPDP-PROCESSOR][IRDAI-LOCALIZATION][SEBI-SBOM]")
        reasoning = "Flagged because " + "; ".join(parts) + "."

    return {
        "risk_score": score,
        "risk_flags": flags,
        "risk_reasoning": "[MOCK MODE — heuristic, not an LLM output] " + reasoning,
    }


def assess_tool(tool: dict) -> dict:
    clauses = load_clauses()
    if os.getenv("ANTHROPIC_API_KEY"):
        prompt = build_prompt(tool, clauses)
        return call_llm_real(prompt)
    return call_llm_mock(tool, clauses)
