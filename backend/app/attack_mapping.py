"""Maps NETRA's own real findings (risk_flags from app/risk_engine.py) to
real MITRE ATT&CK technique IDs.

This is deliberately NOT an attack-simulation engine. It runs nothing, sends
no traffic, executes no adversary behavior — it is a lookup table that gives
a SOC analyst standard ATT&CK-framework language for a finding NETRA has
already made through discovery, the same way a SIEM correlation rule labels
an already-logged event. The team explicitly walked back a "Jatayu Red Team"
attack-simulation framing once before (see the handover doc's Section 5/9)
because it has no connection to NETRA's actual discovery/governance thesis —
this module stays on the discovery side of that line on purpose: it explains
what an existing finding means in attacker terms, it doesn't go looking for
new ones by acting like an attacker.

Coverage is intentionally small (5 rules) and mapped only to flags
app/risk_engine.py actually produces (see BROAD_SCOPE_MARKERS and the
call_llm_mock flags list) — an honest, narrow proof, not a claim of full
ATT&CK Cloud Matrix coverage.
"""

# Each rule: a keyword to match (case-insensitive substring) against a
# tool's risk_flags, the real MITRE ATT&CK technique it corresponds to, and
# a one-line rationale grounded in what the flag actually means.
ATTACK_MAPPING_RULES = [
    {
        "keyword": "over-broad-scope",
        "technique_id": "T1550.001",
        "technique_name": "Use Alternate Authentication Material: Application Access Token",
        "tactic": "Defense Evasion / Lateral Movement",
        "rationale": "An OAuth grant broader than the tool needs is exactly the kind of standing "
                     "application access token an attacker abuses to act as the user without ever "
                     "touching their password.",
    },
    {
        "keyword": "dormant-access",
        "technique_id": "T1078.004",
        "technique_name": "Valid Accounts: Cloud Accounts",
        "tactic": "Persistence / Privilege Escalation / Initial Access / Defense Evasion",
        "rationale": "Access that hasn't been used in 180+ days but was never revoked is unmonitored "
                     "standing access — the same property that makes a compromised valid cloud "
                     "account so hard to detect.",
    },
    {
        "keyword": "usage-unknown",
        "technique_id": "T1526",
        "technique_name": "Cloud Service Discovery",
        "tactic": "Discovery",
        "rationale": "If NETRA itself cannot verify whether a granted tool is actually being used, "
                     "that same blind spot is what this discovery technique exploits from the "
                     "attacker's side — nobody is watching this connection either way.",
    },
    {
        "keyword": "foreign-hosted",
        "technique_id": "T1567",
        "technique_name": "Exfiltration Over Web Service",
        "tactic": "Exfiltration",
        "rationale": "Data flowing to a tool hosted outside India's regulatory boundary is, in "
                     "attacker terms, exfiltration over an already-authorized, easy-to-overlook "
                     "web service — no separate exfil channel needed.",
    },
    {
        "keyword": "unknown-hosting",
        "technique_id": "T1567",
        "technique_name": "Exfiltration Over Web Service",
        "tactic": "Exfiltration",
        "rationale": "The same exfiltration-surface concern applies when hosting location can't be "
                     "verified at all — an unverified destination is not a safer one.",
    },
]

# Applies to every tool regardless of specific flags — any third-party SaaS
# integration is inherently a trusted-relationship supply-chain vector.
_TRUSTED_RELATIONSHIP_RULE = {
    "technique_id": "T1199",
    "technique_name": "Trusted Relationship",
    "tactic": "Initial Access",
    "rationale": "Every third-party SaaS/AI tool with standing access to company data is, by "
                 "definition, a trusted-relationship vector — compromise of the vendor becomes "
                 "compromise of what it can reach here.",
}


def map_flags_to_techniques(risk_flags: list) -> list:
    """Real rule-matching, not an LLM call — deterministic and auditable.
    Returns a de-duplicated list of technique mappings (by technique_id),
    always including the baseline Trusted Relationship mapping."""
    flags_lower = [f.lower() for f in (risk_flags or [])]
    matched = {}

    for rule in ATTACK_MAPPING_RULES:
        if any(rule["keyword"] in f for f in flags_lower):
            matched[rule["technique_id"]] = {
                "technique_id": rule["technique_id"],
                "technique_name": rule["technique_name"],
                "tactic": rule["tactic"],
                "rationale": rule["rationale"],
                "matched_flag": rule["keyword"],
            }

    matched.setdefault(_TRUSTED_RELATIONSHIP_RULE["technique_id"], {
        **_TRUSTED_RELATIONSHIP_RULE,
        "matched_flag": None,
    })

    return list(matched.values())
