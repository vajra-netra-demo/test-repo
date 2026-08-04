"""Picks whichever live-scan provider is actually configured.

GitHub is checked first — it's the primary path (no eligibility gate).
Microsoft Graph remains available as a fallback in case sandbox access
ever clears, without needing any code changes.
"""

from app import github_discovery, live_discovery


class LiveScanNotConfigured(Exception):
    pass


def active_provider():
    if github_discovery.is_configured():
        return "github"
    if live_discovery.is_configured():
        return "microsoft"
    return None


def is_configured() -> bool:
    return active_provider() is not None


def fetch_live_tools() -> list:
    provider = active_provider()
    if provider == "github":
        return github_discovery.fetch_live_tools()
    if provider == "microsoft":
        return live_discovery.fetch_live_tools()
    raise LiveScanNotConfigured(
        "No live-scan provider configured — set GITHUB_TOKEN/GITHUB_ORG (preferred) "
        "or MS_TENANT_ID/MS_CLIENT_ID/MS_CLIENT_SECRET in .env. See LIVE_SCAN_SETUP.md."
    )
