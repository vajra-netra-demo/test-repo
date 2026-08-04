"""Live discovery via Microsoft Graph API — real (not sample) data, sourced
from a free Microsoft 365 Developer Program sandbox tenant.

Proves Questions 1 & 2 of the NETRA pitch live:
  1. WHAT IS RUNNING?   -> GET /servicePrincipals   (real registered apps)
  2. WHAT CAN IT TOUCH? -> GET /oauth2PermissionGrants (real granted scopes)

Does NOT prove Question 3 (WHERE IS THE DATA GOING) — that needs network-
layer DNS/NetFlow tracing, which stays out of MVP scope. hosting_region is
marked "Unknown (live scan — network tracing out of MVP scope)" for every
live-discovered tool, on purpose, so the demo never overclaims.

Also does not provide real last-used/usage data — Microsoft's sign-in logs
are an Azure AD Premium (P1/P2) feature, not available on a free dev tenant.
last_used is marked "Unknown (requires Azure AD Premium sign-in logs)".

Requires MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET in .env, from an
app registered in the sandbox tenant's Azure AD with admin-consented
Application.Read.All (or equivalent) permissions. See LIVE_SCAN_SETUP.md.
"""

import requests

from app.config import MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET

GRAPH_BASE = "https://graph.microsoft.com/v1.0"


class LiveScanNotConfigured(Exception):
    pass


def is_configured() -> bool:
    return bool(MS_TENANT_ID and MS_CLIENT_ID and MS_CLIENT_SECRET)


def _get_token() -> str:
    if not is_configured():
        raise LiveScanNotConfigured(
            "MS_TENANT_ID / MS_CLIENT_ID / MS_CLIENT_SECRET not set in .env — "
            "see LIVE_SCAN_SETUP.md to configure the Microsoft 365 sandbox tenant."
        )
    url = f"https://login.microsoftonline.com/{MS_TENANT_ID}/oauth2/v2.0/token"
    resp = requests.post(url, data={
        "client_id": MS_CLIENT_ID,
        "client_secret": MS_CLIENT_SECRET,
        "scope": "https://graph.microsoft.com/.default",
        "grant_type": "client_credentials",
    }, timeout=15)
    resp.raise_for_status()
    return resp.json()["access_token"]


def _graph_get(token: str, path: str) -> dict:
    resp = requests.get(f"{GRAPH_BASE}{path}", headers={"Authorization": f"Bearer {token}"}, timeout=15)
    resp.raise_for_status()
    return resp.json()


def fetch_live_tools() -> list:
    """Returns a list of tool dicts, same shape as the sample dataset,
    sourced from a real (sandbox) Microsoft 365 tenant via Graph API."""
    token = _get_token()

    principals_by_app_id = {}
    resp = _graph_get(token, "/servicePrincipals?$select=id,appId,displayName,publisherName")
    for sp in resp.get("value", []):
        principals_by_app_id[sp["appId"]] = sp

    grants = _graph_get(token, "/oauth2PermissionGrants").get("value", [])

    tools = []
    for i, grant in enumerate(grants):
        # clientId on the grant is the servicePrincipal's *object* id, not appId —
        # match by id instead.
        matching_sp = next((sp for sp in principals_by_app_id.values() if sp["id"] == grant.get("clientId")), None)
        tool_name = matching_sp["displayName"] if matching_sp else f"Unknown app ({grant.get('clientId', 'n/a')})"
        vendor = (matching_sp or {}).get("publisherName") or "Unknown"
        scopes = (grant.get("scope") or "").split()

        tools.append({
            "id": f"live-{grant.get('id', i)}",
            "tool_name": tool_name,
            "vendor": vendor,
            "category": "Live Discovery (Microsoft Graph)",
            "connected_via": "Microsoft 365 (Live Scan)",
            "department": "Organization-wide (admin consent)" if grant.get("consentType") == "AllPrincipals" else "Unknown (per-user grant)",
            "connected_by_role": "N/A — live scan",
            "first_connected": "Unknown (Graph API does not expose grant creation date on the free tier)",
            "last_used": "Unknown (requires Azure AD Premium sign-in logs)",
            "monthly_active_users": 0,
            "oauth_scopes": scopes,
            "data_categories_accessed": scopes,  # best-effort until real classification is added
            "hosting_region": "Unknown (live scan — network-layer tracing out of MVP scope)",
        })

    return tools
