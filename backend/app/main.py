import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.database import Base, engine
from app.routers import tools, report, discovery, tenants, endpoint, regulation
from app.scheduler import start_scheduler

logger = logging.getLogger(__name__)

app = FastAPI(title="NETRA MVP API", version="0.1.0")

# Allows the dashboard (the React app built from ../frontend) to be hosted
# separately (e.g. on Vercel) from this API (Railway) and still call it
# cross-origin. No cookie-based auth exists to protect here — there's no
# login/RBAC at all yet — so a wide-open CORS policy doesn't weaken anything
# that isn't already this open.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)

app.include_router(tools.router)
app.include_router(report.router)
app.include_router(discovery.router)
app.include_router(tenants.router)
app.include_router(endpoint.router)
app.include_router(regulation.router)

# presidio-analyzer + spacy (requirements-classification.txt) aren't in the
# base requirements.txt — a real deploy without them shouldn't crash the
# whole app on import, only leave /classify/* unavailable.
try:
    from app.routers import classify

    app.include_router(classify.router)
except ImportError as exc:
    logger.warning("Sensitive-data classification disabled — %s not installed (see requirements-classification.txt). /classify/* routes are unavailable.", exc.name)


@app.on_event("startup")
def _on_startup():
    start_scheduler()


@app.get("/health")
def health():
    return {"status": "ok"}


# Mounted last so /health, /tools, /report, /discovery are matched first —
# this serves the React dashboard (../frontend, built with `npm run build`)
# at "/". Run the frontend build before starting this app locally, or this
# mount will 404 with a missing-directory error — see frontend/README.md.
STATIC_DIR = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
