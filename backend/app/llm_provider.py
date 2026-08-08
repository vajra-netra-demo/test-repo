"""Single point of contact for "call the real LLM" — used by both
risk_engine.py and triage_agent.py instead of each independently
instantiating an AnthropicFoundry client.

Why this exists (see TriNetra_HLD.docx / handover doc "sovereignty" note):
TriNetra's pitch originally implied "hosted on ESDS GPU capacity so no data
leaves India." As actually built, REAL mode calls Microsoft Azure Foundry
in East US 2 — that claim is false for the current provider and should not
be repeated until a real India/on-prem path exists. Routing every call
through this one module means a future India-hosted provider (e.g. a local
Ollama model, if one becomes available) is a change in exactly one place,
not a hunt through risk_engine.py/triage_agent.py.
"""

import time

from app.config import ANTHROPIC_FOUNDRY_API_KEY, ANTHROPIC_FOUNDRY_RESOURCE

# Azure Foundry's rate limit is per-minute and shared across the whole
# deployment -- easy to hit during a full scan cycle (one real call per
# tool, in quick succession, for every tool in the inventory). A short
# backoff-and-retry clears a per-minute limit far more often than not;
# 5s/15s/35s totals under a minute of extra wait in the worst case, which
# is nothing next to a scan that can already run for minutes across many
# tools.
RATE_LIMIT_BACKOFF_SECONDS = [5, 15, 35]

MODEL_NAME = "claude-haiku-4-5"

# What's actually true today. Do not change this to "India"/"ESDS GPU"
# without a real India-hosted provider behind it — see the module docstring.
PROVIDER = "microsoft_foundry"
PROVIDER_REGION = "East US 2 (Azure)"


def is_configured() -> bool:
    return bool(ANTHROPIC_FOUNDRY_API_KEY)


def call_llm(prompt: str, max_tokens: int) -> str:
    """Returns the raw text response. Only invoked when is_configured() is
    True — callers still own the REAL-vs-MOCK branch, this just removes the
    duplicated client setup between risk_engine.py and triage_agent.py."""
    import anthropic  # lazy import — only required when this path actually runs

    # A full scan cycle calls this once per tool, sequentially. Without a
    # bounded timeout, one slow/hung call stalls the entire batch (and the
    # background scan thread — see app/manual_scan.py) indefinitely, with no
    # way to recover short of a server restart.
    client = anthropic.AnthropicFoundry(
        api_key=ANTHROPIC_FOUNDRY_API_KEY, resource=ANTHROPIC_FOUNDRY_RESOURCE, timeout=30.0,
    )

    attempts = len(RATE_LIMIT_BACKOFF_SECONDS) + 1
    for attempt in range(attempts):
        try:
            response = client.messages.create(
                model=MODEL_NAME,
                max_tokens=max_tokens,
                messages=[{"role": "user", "content": prompt}],
            )
            return response.content[0].text
        except anthropic.RateLimitError:
            if attempt == attempts - 1:
                raise
            time.sleep(RATE_LIMIT_BACKOFF_SECONDS[attempt])
