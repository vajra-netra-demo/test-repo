"""Single point of contact for "call the real LLM" — used by both
risk_engine.py and triage_agent.py instead of each independently
instantiating an AnthropicFoundry client.

Why this exists (see NETRA_HLD.docx / handover doc "sovereignty" note):
NETRA's pitch originally implied "hosted on ESDS GPU capacity so no data
leaves India." As actually built, REAL mode calls Microsoft Azure Foundry
in East US 2 — that claim is false for the current provider and should not
be repeated until a real India/on-prem path exists. Routing every call
through this one module means a future India-hosted provider (e.g. a local
Ollama model, if one becomes available) is a change in exactly one place,
not a hunt through risk_engine.py/triage_agent.py.
"""

from app.config import ANTHROPIC_FOUNDRY_API_KEY, ANTHROPIC_FOUNDRY_RESOURCE

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

    client = anthropic.AnthropicFoundry(api_key=ANTHROPIC_FOUNDRY_API_KEY, resource=ANTHROPIC_FOUNDRY_RESOURCE)
    response = client.messages.create(
        model=MODEL_NAME,
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.content[0].text
