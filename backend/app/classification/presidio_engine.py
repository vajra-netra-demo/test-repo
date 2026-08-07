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
identifiers — without needing a trained model at all.

For unstructured PII (a name or organization mentioned in free text, which
regex/checksums structurally can't catch), this does now use the spaCy model
already loaded above via Presidio's built-in SpacyRecognizer (PERSON/
LOCATION/ORGANIZATION — see RELEVANT_ENTITIES below). This is still not a
custom-trained model for this domain — it's the same off-the-shelf spaCy
NER everyone uses — and it has the real, honest limitation general-purpose
NER always has: it can misfire on structured identifiers. In our own
testing it mislabeled "PAN" itself as ORGANIZATION and a PAN number as
PERSON in the same sentence. That's exactly why it stays a complementary
signal, layered alongside the deterministic checksum-validated recognizers,
not a replacement for them.
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
#
# PERSON/LOCATION/ORGANIZATION are NOT new pattern recognizers — they come
# free from spaCy's own pretrained NER model (en_core_web_sm), which
# Presidio's SpacyRecognizer already wraps because get_analyzer() configured
# spaCy as the nlp_engine (originally just for tokenization ahead of the
# regex/checksum recognizers below). This is still not a custom-trained
# model for this domain — it's the same off-the-shelf model everyone else
# uses spaCy for — but it's a genuine, real complementary layer for
# unstructured PII (a name or org mentioned in free text) that regex and
# checksum validation structurally cannot catch, since PAN/Aadhaar/IFSC/
# GSTIN detection only ever looks for a fixed identifier shape.
RELEVANT_ENTITIES = [
    "IN_PAN", "IN_AADHAAR", "IN_IFSC", "IN_GSTIN",
    "EMAIL_ADDRESS", "PHONE_NUMBER", "CREDIT_CARD",
    "PERSON", "LOCATION", "ORGANIZATION",
]


def _mask_span(matched: str) -> str:
    return matched[:2] + "•" * max(len(matched) - 4, 0) + matched[-2:] if len(matched) > 4 else "•" * len(matched)


def mask_text(text: str, results) -> str:
    """Rebuilds `text` with every detected entity span replaced by its
    masked form (same scheme as the per-entity examples below) — used for
    anything derived from the input that gets persisted or displayed
    (e.g. a history-table snippet), so a tool whose whole purpose is
    finding sensitive data doesn't turn around and store/echo that same
    data in the clear. Spans are replaced back-to-front so earlier offsets
    stay valid as the string shrinks/grows."""
    masked = text
    for r in sorted(results, key=lambda r: r.start, reverse=True):
        masked = masked[: r.start] + _mask_span(text[r.start : r.end]) + masked[r.end :]
    return masked


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
        masked = _mask_span(text[r.start:r.end])
        examples.setdefault(r.entity_type, []).append({"masked_value": masked, "confidence": round(r.score, 2)})

    # Simple, transparent scoring: each detected entity type present adds to
    # sensitivity, weighted slightly higher for the four regulated Indian
    # identifiers than for generic PII — mirrors risk_engine.py's own
    # transparent, explainable scoring style rather than a black-box number.
    weights = {
        "IN_PAN": 25, "IN_AADHAAR": 30, "IN_IFSC": 20, "IN_GSTIN": 20,
        "EMAIL_ADDRESS": 5, "PHONE_NUMBER": 5, "CREDIT_CARD": 15,
        "PERSON": 8, "LOCATION": 3, "ORGANIZATION": 3,
    }
    sensitivity_score = min(sum(weights.get(et, 5) for et in entity_counts), 100)

    return {
        "entity_counts": entity_counts,
        "examples": examples,
        "sensitivity_score": sensitivity_score,
        "masked_text": mask_text(text, results),
    }
