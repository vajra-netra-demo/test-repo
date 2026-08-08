"""Live discovery via ManageEngine's Desktop Central / Endpoint Central REST
API — the fast-path alternative to a custom endpoint agent that the mentor
(Zeeshan Shaikh) floated on the call, since ESDS's own IT already runs
ManageEngine and it already has agent-based endpoint software inventory.

TIER 2 / UNTESTED: this project has no real ManageEngine API key — that
belongs to Zeeshan's team. Shaped against ManageEngine's publicly documented
Software Inventory API so it can be activated the moment real credentials
arrive, exactly the same "build it now, activate later" precedent already
proven with live_discovery.py (Microsoft Graph). Do not claim this works
until it has actually been run against a real ManageEngine instance —
is_configured() staying False is the honest state today.

Zeeshan's own caveat from the call applies here too: even once working,
this surfaces ManageEngine's own inventory, not a TriNetra-native capability —
useful for real endpoint data fast, not a replacement for the read-only
agent in netra-mvp/agent/.
"""

import requests

from app.config import MANAGEENGINE_BASE_URL, MANAGEENGINE_API_KEY


class LiveScanNotConfigured(Exception):
    pass


def is_configured() -> bool:
    return bool(MANAGEENGINE_BASE_URL and MANAGEENGINE_API_KEY)


def _get(path: str) -> dict:
    if not is_configured():
        raise LiveScanNotConfigured(
            "MANAGEENGINE_BASE_URL / MANAGEENGINE_API_KEY not set — this provider is "
            "untested pending real credentials from ESDS's ManageEngine admin."
        )
    resp = requests.get(
        f"{MANAGEENGINE_BASE_URL}{path}",
        headers={"Authorization": MANAGEENGINE_API_KEY},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()


def fetch_live_tools() -> list:
    """Returns a list of tool dicts, same shape as the sample dataset,
    sourced from ManageEngine's installed-software inventory API
    (documented endpoint shape: GET /dcapi/software/installed) — one row
    per installed software item per managed endpoint."""
    data = _get("/dcapi/software/installed")

    tools = []
    for i, item in enumerate(data.get("message_response", {}).get("software", [])):
        tools.append({
            "id": f"live-me-{item.get('resource_id', i)}-{i}",
            "tool_name": item.get("software_name", "Unknown"),
            "vendor": item.get("vendor_name", "Unknown"),
            "category": "Live Discovery (ManageEngine)",
            "connected_via": "ManageEngine Endpoint Central (Live Scan)",
            "department": item.get("department", "Unknown"),
            "connected_by_role": item.get("user_name", "N/A — live scan"),
            "first_connected": item.get("installed_date", "Unknown"),
            "last_used": "Unknown (ManageEngine software inventory does not expose last-used time)",
            "monthly_active_users": 0,
            "oauth_scopes": [],  # ManageEngine tracks installed software, not OAuth grants
            "data_categories_accessed": [],
            "hosting_region": "N/A — endpoint-installed software, not a cloud service",
        })

    return tools
