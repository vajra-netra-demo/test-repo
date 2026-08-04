"""Live discovery via Google Workspace's Admin SDK Directory API — the
Google-side counterpart to live_discovery.py's Microsoft Graph path.

Proves the same two questions Microsoft Graph does:
  1. WHAT IS RUNNING?   -> per-user OAuth token grants (real third-party
                            apps a Workspace user has authorized)
  2. WHAT CAN IT TOUCH? -> the scopes on each token

TIER 2 / UNTESTED: no real Google Workspace admin domain exists for this
team to test against. Worth a real attempt before writing this off
entirely — a free Google Workspace trial may grant genuine Admin SDK
access the same way a free GitHub org unblocked over the Microsoft 365
Developer Program sandbox. If a trial domain works, this graduates to a
real, verified provider using the exact same code below; until then,
is_configured() stays False and this sits dormant, same precedent as
live_discovery.py.

Auth requires a service account with domain-wide delegation, impersonating
a real admin user — this is what makes it heavier than the Microsoft Graph
client-credentials flow, and why it's Tier 2 rather than assumed-easy.
"""

from app.config import (
    GOOGLE_WORKSPACE_CUSTOMER_ID,
    GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON,
    GOOGLE_WORKSPACE_ADMIN_EMAIL,
)

DIRECTORY_SCOPES = [
    "https://www.googleapis.com/auth/admin.directory.user.readonly",
    "https://www.googleapis.com/auth/admin.directory.user.security",
]


class LiveScanNotConfigured(Exception):
    pass


def is_configured() -> bool:
    return bool(
        GOOGLE_WORKSPACE_CUSTOMER_ID
        and GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON
        and GOOGLE_WORKSPACE_ADMIN_EMAIL
    )


def _get_directory_service():
    """Builds an authenticated Admin SDK Directory API client via a service
    account impersonating a real Workspace admin (domain-wide delegation).
    Lazy imports since google-auth/google-api-python-client are optional
    dependencies, only needed if this provider is ever actually configured."""
    if not is_configured():
        raise LiveScanNotConfigured(
            "GOOGLE_WORKSPACE_CUSTOMER_ID / GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON / "
            "GOOGLE_WORKSPACE_ADMIN_EMAIL not set — this provider is untested pending "
            "a real Google Workspace admin domain."
        )
    import json
    from google.oauth2 import service_account
    from googleapiclient.discovery import build

    info = json.loads(GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON)
    credentials = service_account.Credentials.from_service_account_info(
        info, scopes=DIRECTORY_SCOPES
    ).with_subject(GOOGLE_WORKSPACE_ADMIN_EMAIL)
    return build("admin", "directory_v1", credentials=credentials)


def fetch_live_tools() -> list:
    """Returns a list of tool dicts, same shape as the sample dataset. Lists
    every user in the domain, then every OAuth token each has granted to a
    third-party app (Directory API: users.tokens.list) — the real per-user
    grant visibility Microsoft Graph's free tier can't provide either, so
    if this ever gets activated it's a genuine improvement, not a duplicate."""
    service = _get_directory_service()

    users_resp = service.users().list(customer=GOOGLE_WORKSPACE_CUSTOMER_ID, maxResults=500).execute()
    users = users_resp.get("users", [])

    tools = []
    for user in users:
        user_key = user.get("primaryEmail")
        tokens_resp = service.tokens().list(userKey=user_key).execute()
        for i, token in enumerate(tokens_resp.get("items", [])):
            tools.append({
                "id": f"live-gws-{user_key}-{i}",
                "tool_name": token.get("displayText", token.get("clientId", "Unknown")),
                "vendor": token.get("clientId", "Unknown"),
                "category": "Live Discovery (Google Workspace)",
                "connected_via": "Google Workspace (Live Scan)",
                "department": user.get("orgUnitPath", "Unknown"),
                "connected_by_role": user_key,
                "first_connected": "Unknown (Directory API does not expose grant date)",
                "last_used": "Unknown (requires Workspace Reports API audit log)",
                "monthly_active_users": 1,
                "oauth_scopes": token.get("scopes", []),
                "data_categories_accessed": token.get("scopes", []),
                "hosting_region": "Unknown (live scan — network-layer tracing out of MVP scope)",
            })

    return tools
