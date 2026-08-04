"""Demo-facing proof-of-real-retrieval endpoint. Query it with different
terms and get different, differently-ranked clauses back — the same
"prove it's not static" bar used to verify the LLM itself isn't mocked."""

from fastapi import APIRouter

from app.rag.retriever import retrieve

router = APIRouter(prefix="/regulation", tags=["regulation"])


@router.get("/search")
def search(q: str, k: int = 5):
    results = retrieve(q, k=k)
    return {"query": q, "results": results}
