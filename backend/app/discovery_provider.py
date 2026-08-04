"""Picks whichever live-scan provider is actually configured.

GitHub is checked first — it's the primary path (no eligibility gate).
Microsoft Graph, ManageEngine, and Google Workspace remain available as
fallbacks in case their respective access ever clears, without needing any
code changes. ManageEngine and Google Workspace are Tier-2/untested as of
this build — real credentials for both belong to systems outside this
team's control (see their modules' docstrings) — but is_configured()
correctly reports False for each until that changes, so they sit dormant
rather than silently half-active.

Note: this dispatch is exclusive (first configured provider wins), not
additive. That's fine while at most one provider is ever configured at a
time in practice, but if a second one (e.g. Google Workspace) is ever
activated alongside GitHub, this would need to become additive — merging
results from every configured provider — or the second source would never
surface.
"""

from app import github_discovery, live_discovery, manageengine_discovery, google_workspace_discovery


class LiveScanNotConfigured(Exception):
    pass


def active_provider():
    if github_discovery.is_configured():
        return "github"
    if live_discovery.is_configured():
        return "microsoft"
    if manageengine_discovery.is_configured():
        return "manageengine"
    if google_workspace_discovery.is_configured():
        return "google_workspace"
    return None


def is_configured() -> bool:
    return active_provider() is not None


def fetch_live_tools() -> list:
    provider = active_provider()
    if provider == "github":
        return github_discovery.fetch_live_tools()
    if provider == "microsoft":
        return live_discovery.fetch_live_tools()
    if provider == "manageengine":
        return manageengine_discovery.fetch_live_tools()
    if provider == "google_workspace":
        return google_workspace_discovery.fetch_live_tools()
    raise LiveScanNotConfigured(
        "No live-scan provider configured — set GITHUB_TOKEN/GITHUB_ORG (preferred), "
        "MS_TENANT_ID/MS_CLIENT_ID/MS_CLIENT_SECRET, MANAGEENGINE_BASE_URL/MANAGEENGINE_API_KEY, "
        "or GOOGLE_WORKSPACE_* in .env. See LIVE_SCAN_SETUP.md."
    )
