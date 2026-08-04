"""Real retrieval over the regulatory clause corpus — TF-IDF + cosine
similarity, not everything dumped statically into every prompt.

Deliberately NOT sentence-transformers/torch: that pulls in a multi-GB
dependency chain for an embedding model, a real Railway deploy-size/time
risk for a corpus this small. scikit-learn's TF-IDF vectorizer needs no
model download, is deterministic, and is genuine retrieval — different
queries surface different, differently-ranked clauses, which is the actual
property that matters (see the plan's verification bar: prove it's not
static, the same way the LLM's non-determinism proved it wasn't mocked).

No separate offline index-build step: the corpus is ~20 short clauses, so
fitting the vectorizer is sub-millisecond. It's recomputed once per process
(lru_cache) directly from regulatory_clauses.json, so it can never go stale
relative to that file the way a persisted index built at a different time
could.
"""

import json
from functools import lru_cache
from pathlib import Path

CLAUSES_FILE = Path(__file__).resolve().parent.parent.parent / "data" / "regulatory_clauses.json"


@lru_cache(maxsize=1)
def _load_clauses() -> list:
    with open(CLAUSES_FILE, "r", encoding="utf-8") as f:
        return json.load(f)["clauses"]


def _clause_text(clause: dict) -> str:
    """The text actually indexed for retrieval — framework + topic + summary,
    so a query matching either the regulation name or its subject matter
    can surface the clause, not just exact summary-wording matches."""
    return f"{clause['framework']} {clause['topic']} {clause['summary']}"


@lru_cache(maxsize=1)
def _index():
    from sklearn.feature_extraction.text import TfidfVectorizer

    clauses = _load_clauses()
    vectorizer = TfidfVectorizer(stop_words="english")
    matrix = vectorizer.fit_transform([_clause_text(c) for c in clauses])
    return vectorizer, matrix, clauses


def retrieve(query: str, k: int = 5) -> list:
    """Returns the top-k most relevant clauses for `query`, ranked by cosine
    similarity — real retrieval, distinct results for distinct queries."""
    from sklearn.metrics.pairwise import cosine_similarity

    vectorizer, matrix, clauses = _index()
    query_vec = vectorizer.transform([query])
    scores = cosine_similarity(query_vec, matrix).ravel()
    ranked_indices = scores.argsort()[::-1][:k]
    return [clauses[i] for i in ranked_indices if scores[i] > 0] or clauses[:k]


def retrieve_relevant_clauses(tool: dict, k: int = 5) -> list:
    """Builds a query from a discovered tool's own access footprint (the
    same fields risk_engine.py already has) and retrieves the clauses most
    relevant to *that specific tool*, instead of every tool getting the same
    static full clause list regardless of what it actually does."""
    query_parts = [
        tool.get("category", ""),
        tool.get("hosting_region", ""),
        " ".join(tool.get("oauth_scopes") or []),
        " ".join(tool.get("data_categories_accessed") or []),
    ]
    query = " ".join(p for p in query_parts if p)
    return retrieve(query, k=k) if query.strip() else _load_clauses()[:k]
