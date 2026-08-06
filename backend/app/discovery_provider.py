"""Merges results from every live-scan provider that's actually configured.

GitHub was the primary path (no eligibility gate) while it was the only
provider genuinely activated. Microsoft Graph, ManageEngine, and Google
Workspace remain available the same way. ManageEngine and Google Workspace
are Tier-2/untested as of this build — real credentials for both belong to
systems outside this team's control (see their modules' docstrings) — but
is_configured() correctly reports False for each until that changes, so
they sit dormant rather than silently half-active.

Deliberately additive, not "first configured provider wins": as soon as a
second provider (Microsoft Graph, via a real Entra ID tenant this team
actually administers) is genuinely activated alongside GitHub, an exclusive
dispatch would silently drop it entirely — the exact gap this module's own
docstring used to flag as a known future need. ID collisions aren't a
concern: github_discovery prefixes ids "live-gh-...", live_discovery
(Microsoft Graph) prefixes "live-{grant_id}" — distinct namespaces.
"""

from app import github_discovery, live_discovery, manageengine_discovery, google_workspace_discovery


class LiveScanNotConfigured(Exception):
    pass


_MODULES = {
    "github": github_discovery,
    "microsoft": live_discovery,
    "manageengine": manageengine_discovery,
    "google_workspace": google_workspace_discovery,
}


def active_providers() -> list:
    providers = []
    if github_discovery.is_configured():
        providers.append("github")
    if live_discovery.is_configured():
        providers.append("microsoft")
    if manageengine_discovery.is_configured():
        providers.append("manageengine")
    if google_workspace_discovery.is_configured():
        providers.append("google_workspace")
    return providers


def active_provider():
    """Back-compat single-value view for the dashboard's status pill —
    "+"-joined across every configured provider (e.g. "github+microsoft"),
    or None if none are configured. Degrades to a single name exactly like
    before when only one provider is active."""
    providers = active_providers()
    return "+".join(providers) if providers else None


def is_configured() -> bool:
    return bool(active_providers())


def fetch_live_tools() -> list:
    providers = active_providers()
    if not providers:
        raise LiveScanNotConfigured(
            "No live-scan provider configured — set GITHUB_TOKEN/GITHUB_ORG (preferred), "
            "MS_TENANT_ID/MS_CLIENT_ID/MS_CLIENT_SECRET, MANAGEENGINE_BASE_URL/MANAGEENGINE_API_KEY, "
            "or GOOGLE_WORKSPACE_* in .env. See LIVE_SCAN_SETUP.md."
        )
    tools = []
    for provider in providers:
        tools.extend(_MODULES[provider].fetch_live_tools())
    return tools
