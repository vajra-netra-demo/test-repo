"""Wraps presidio_analyzer.AnalyzerEngine, forced onto spaCy's SMALL English
model (en_core_web_sm, ~15MB) rather than the default en_core_web_lg
(~400MB) — AnalyzerEngine() with no explicit nlp_engine downloads the large
model automatically, which would be a real Railway deploy-size/time problem
for no accuracy benefit on our use case (pattern-based Indian-identifier
detection needs tokenization, not deep NLP).

Lazily initialized — the spaCy model load is real disk/CPU work, so it
happens once on first use, not at import time / app startup.

Deliberately not a custom-trained NER model: training one needs labeled
Indian-identifier training data and training time neither of which exist
for a hackathon build. Presidio's pattern recognizers (indian_recognizers.py)
plus real checksum validation (Verhoeff for Aadhaar, mod-36 for GSTIN) cover
the actual, practical need — deterministic detection of structured
identifiers — without needing a trained model at all. A custom NER model
would only earn its cost for unstructured/free-text PII detection beyond
what regex+checksums already catch correctly.
"""

from functools import lru_cache

from app.classification.indian_recognizers import all_indian_recognizers


@lru_cache(maxsize=1)
def get_analyzer():
    from presidio_analyzer import AnalyzerEngine
    from presidio_analyzer.nlp_engine import NlpEngineProvider

    nlp_engine = NlpEngineProvider(nlp_configuration={
        "nlp_engine_name": "spacy",
        "models": [{"lang_code": "en", "model_name": "en_core_web_sm"}],
    }).create_engine()

    analyzer = AnalyzerEngine(nlp_engine=nlp_engine, supported_languages=["en"])
    for recognizer in all_indian_recognizers():
        analyzer.registry.add_recognizer(recognizer)
    return analyzer


# Entities worth surfacing in NETRA's context — the built-in generic ones
# (email, phone, credit card) plus our four Indian-specific ones. Presidio
# ships several other built-ins (US SSN, IBAN, etc.) that are noise here.
RELEVANT_ENTITIES = [
    "IN_PAN", "IN_AADHAAR", "IN_IFSC", "IN_GSTIN",
    "EMAIL_ADDRESS", "PHONE_NUMBER", "CREDIT_CARD",
]


def classify_text(text: str) -> dict:
    """Runs the real Presidio analyzer over `text` and returns a summary
    shaped for the dashboard/API — entity counts plus per-entity examples
    (truncated, never the full matched value) so a demo can show *that*
    something was found without echoing back raw sensitive data."""
    analyzer = get_analyzer()
    results = analyzer.analyze(text=text, language="en", entities=RELEVANT_ENTITIES)

    entity_counts: dict = {}
    examples: dict = {}
    for r in results:
        entity_counts[r.entity_type] = entity_counts.get(r.entity_type, 0) + 1
        matched = text[r.start:r.end]
        masked = matched[:2] + "•" * max(len(matched) - 4, 0) + matched[-2:] if len(matched) > 4 else "•" * len(matched)
        examples.setdefault(r.entity_type, []).append({"masked_value": masked, "confidence": round(r.score, 2)})

    # Simple, transparent scoring: each detected entity type present adds to
    # sensitivity, weighted slightly higher for the four regulated Indian
    # identifiers than for generic PII — mirrors risk_engine.py's own
    # transparent, explainable scoring style rather than a black-box number.
    weights = {"IN_PAN": 25, "IN_AADHAAR": 30, "IN_IFSC": 20, "IN_GSTIN": 20, "EMAIL_ADDRESS": 5, "PHONE_NUMBER": 5, "CREDIT_CARD": 15}
    sensitivity_score = min(sum(weights.get(et, 5) for et in entity_counts), 100)

    return {
        "entity_counts": entity_counts,
        "examples": examples,
        "sensitivity_score": sensitivity_score,
    }
