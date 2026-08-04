from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from app.config import DATABASE_URL

# A bare "postgresql://" URL makes SQLAlchemy default to the legacy psycopg2
# dialect regardless of what's actually installed — only "postgresql+psycopg://"
# selects psycopg3, which is what requirements.txt actually installs. Upgrade
# it automatically so a Postgres addon's auto-generated DATABASE_URL (e.g.
# Railway's) works as-is, without anyone needing to remember this detail.
_db_url = DATABASE_URL
if _db_url.startswith("postgresql://") or _db_url.startswith("postgres://"):
    _db_url = _db_url.split("://", 1)[1]
    _db_url = f"postgresql+psycopg://{_db_url}"

connect_args = {"check_same_thread": False} if _db_url.startswith("sqlite") else {}
engine = create_engine(_db_url, connect_args=connect_args)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
