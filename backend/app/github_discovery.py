"""Live discovery via the GitHub API — the primary live-scan provider.

Chosen over Microsoft Graph as the primary path because it needs no
eligibility gate: any existing GitHub account can create a free
organization instantly and install free GitHub Apps to generate real data,
unlike the Microsoft 365 Developer Program sandbox (which repeatedly
rejected this team across multiple accounts).

Proves Questions 1 & 2 of the NETRA pitch live, same as the Microsoft Graph
module:
  1. WHAT IS RUNNING?   -> GET /orgs/{org}/installations (real installed GitHub Apps)
  2. WHAT CAN IT TOUCH? -> the `permissions` object on each installation (real granted scopes)

Does NOT prove Question 3 (WHERE IS THE DATA GOING) — GitHub Apps are
third-party-hosted and their hosting location isn't disclosed via this API.
hosting_region is marked accordingly, on purpose, so the demo never
overclaims.

Unlike the Microsoft Graph path, GitHub's API DOES give real
created_at/updated_at timestamps per installation — so, unlike the MS Graph
module, last_used here is a genuine (if imperfect — it's "last permission
update", not "last active use") signal, not a placeholder.

Requires GITHUB_TOKEN (classic PAT, "admin:org" scope) and GITHUB_ORG in
.env. See LIVE_SCAN_SETUP.md for the GitHub-specific setup steps.
"""

import requests

from app.config import GITHUB_TOKEN, GITHUB_ORG

GITHUB_API = "https://api.github.com"


class LiveScanNotConfigured(Exception):
    pass


def is_configured() -> bool:
    return bool(GITHUB_TOKEN and GITHUB_ORG)


def _headers():
    return {
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def _get(path: str):
    if not is_configured():
        raise LiveScanNotConfigured(
            "GITHUB_TOKEN / GITHUB_ORG not set in .env — see LIVE_SCAN_SETUP.md."
        )
    resp = requests.get(f"{GITHUB_API}{path}", headers=_headers(), timeout=15)
    resp.raise_for_status()
    return resp.json()


def revoke_installation(installation_id: str) -> None:
    """Actually uninstalls a GitHub App from the org — a real, irreversible
    action against a live external system (not a simulation). Only call
    this behind an explicit, confirmed user action."""
    if not is_configured():
        raise LiveScanNotConfigured(
            "GITHUB_TOKEN / GITHUB_ORG not set in .env — see LIVE_SCAN_SETUP.md."
        )
    resp = requests.delete(
        f"{GITHUB_API}/orgs/{GITHUB_ORG}/installations/{installation_id}",
        headers=_headers(),
        timeout=15,
    )
    resp.raise_for_status()


def fetch_live_tools() -> list:
    """Returns a list of tool dicts, same shape as the sample dataset,
    sourced from real installed GitHub Apps on the configured organization."""
    data = _get(f"/orgs/{GITHUB_ORG}/installations")
    installations = data.get("installations", [])

    tools = []
    for inst in installations:
        app_slug = inst.get("app_slug", f"app-{inst.get('app_id')}")
        permissions = inst.get("permissions", {}) or {}
        scopes = [f"{resource}:{level}" for resource, level in permissions.items()]
        repo_selection = inst.get("repository_selection", "unknown")

        tools.append({
            "id": f"live-gh-{inst.get('id')}",
            "tool_name": app_slug,
            "vendor": app_slug,
            "category": "Live Discovery (GitHub App)",
            "connected_via": "GitHub (Live Scan)",
            "department": "Organization-wide" if repo_selection == "all" else "Selected repositories",
            "connected_by_role": "N/A — live scan",
            "first_connected": (inst.get("created_at") or "")[:10] or "Unknown",
            "last_used": (inst.get("updated_at") or "")[:10] or "Unknown",
            "monthly_active_users": 0,
            "oauth_scopes": scopes,
            "data_categories_accessed": scopes,
            "hosting_region": "Unknown (live scan — third-party GitHub App hosting not disclosed via this API)",
        })

    return tools
