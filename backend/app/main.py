import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.auth import bootstrap_admin_user
from app.config import ADMIN_PASSWORD, ADMIN_USERNAME
from app.database import Base, SessionLocal, engine, ensure_new_columns
from app.routers import auth, tools, report, discovery, tenants, endpoint, regulation, red_agent
from app.scheduler import start_scheduler
from app.tasks import ensure_worker_running

logger = logging.getLogger(__name__)

app = FastAPI(title="TriNetra MVP API", version="0.1.0")

# Allows the dashboard (the React app built from ../frontend) to be hosted
# separately (e.g. on Vercel) from this API (Railway) and still call it
# cross-origin. JWT auth (app/auth.py) is carried in an Authorization
# header, not a cookie, so a wide-open CORS policy doesn't expose session
# state the way it would for cookie-based auth.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)
ensure_new_columns()

app.include_router(auth.router)
app.include_router(tools.router)
app.include_router(report.router)
app.include_router(discovery.router)
app.include_router(tenants.router)
app.include_router(endpoint.router)
app.include_router(regulation.router)
app.include_router(red_agent.router)

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
    db = SessionLocal()
    try:
        bootstrap_admin_user(db, ADMIN_USERNAME, ADMIN_PASSWORD)
    finally:
        db.close()
    start_scheduler()
    ensure_worker_running()


@app.get("/health")
def health():
    return {"status": "ok"}


# Mounted last so /health, /tools, /report, /discovery are matched first —
# this serves the React dashboard at "/". The build (frontend/, `npm run
# build`) is committed here as plain static output rather than built by
# Railway itself: this service's Root Directory is backend/, a sibling of
# frontend/, so Railway's build can't see frontend/ to build it. Run
# `npm run build` in frontend/ and copy dist/* here again after any
# frontend change — see frontend/README.md.
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
