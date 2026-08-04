import json
from pathlib import Path

from fastapi import APIRouter

router = APIRouter(prefix="/tenants", tags=["tenants"])

PROFILES_FILE = Path(__file__).resolve().parent.parent.parent / "data" / "customer_profiles.json"


@router.get("")
def list_tenants():
    with open(PROFILES_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data["profiles"]
