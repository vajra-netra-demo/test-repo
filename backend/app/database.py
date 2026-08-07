from sqlalchemy import create_engine, inspect, text
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


# No migrations framework in this project — Base.metadata.create_all() only
# ever issues CREATE TABLE IF NOT EXISTS, it never ALTERs an existing table.
# That's fine for brand-new tables, but production's saas_tools table already
# has real scanned data in it, so a newly-added nullable column needs an
# actual ALTER TABLE or every write referencing it fails. This runs after
# create_all() at startup, checks what's actually there via SQLAlchemy's
# inspector, and adds only what's missing — safe to run on every boot,
# including a completely fresh database (table won't exist yet the first
# time, so this simply no-ops and create_all's own columns stand).
_NEW_NULLABLE_COLUMNS = {
    "saas_tools": {
        "tls_issuer_org": "VARCHAR",
        "tls_subject_org": "VARCHAR",
        "previous_risk_score": "INTEGER",
    },
}


def ensure_new_columns():
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    for table, columns in _NEW_NULLABLE_COLUMNS.items():
        if table not in existing_tables:
            continue
        existing_columns = {c["name"] for c in inspector.get_columns(table)}
        with engine.begin() as conn:
            for col, coltype in columns.items():
                if col not in existing_columns:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {coltype}"))
