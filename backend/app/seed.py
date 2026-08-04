"""Loads netra-mvp/data/sample_saas_tools.json into the database.

Run with:  python -m app.seed
Safe to re-run — clears and reloads the table each time.
"""

import json
from pathlib import Path

from app.database import Base, SessionLocal, engine
from app.models import SaaSTool

DATA_FILE = Path(__file__).resolve().parent.parent.parent / "data" / "sample_saas_tools.json"


def seed():
    Base.metadata.create_all(bind=engine)

    with open(DATA_FILE, "r", encoding="utf-8") as f:
        payload = json.load(f)

    db = SessionLocal()
    try:
        db.query(SaaSTool).filter(SaaSTool.source == "sample").delete()

        for record in payload["tools"]:
            db.add(SaaSTool(
                id=record["id"],
                tool_name=record["tool_name"],
                vendor=record["vendor"],
                category=record["category"],
                connected_via=record["connected_via"],
                department=record["department"],
                connected_by_role=record["connected_by_role"],
                first_connected=record["first_connected"],
                last_used=record["last_used"],
                monthly_active_users=record["monthly_active_users"],
                oauth_scopes=record["oauth_scopes"],
                data_categories_accessed=record["data_categories_accessed"],
                hosting_region=record["hosting_region"],
                source="sample",
            ))

        db.commit()
        count = db.query(SaaSTool).filter(SaaSTool.source == "sample").count()
        print(f"Seeded {count} sample tools from {DATA_FILE}")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
