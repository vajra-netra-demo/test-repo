from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.database import Base, engine
from app.routers import tools, report, discovery
from app.scheduler import start_scheduler

app = FastAPI(title="NETRA MVP API", version="0.1.0")

Base.metadata.create_all(bind=engine)

app.include_router(tools.router)
app.include_router(report.router)
app.include_router(discovery.router)


@app.on_event("startup")
def _on_startup():
    start_scheduler()


@app.get("/health")
def health():
    return {"status": "ok"}


# Mounted last so /health, /tools, /report, /discovery are matched first —
# this serves the Day 5 dashboard at "/".
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
