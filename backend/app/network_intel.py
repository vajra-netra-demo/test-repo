"""DNS + IP geolocation — an honest, lightweight substitute for real
network-tap/NetFlow capture, which needs corporate network infrastructure
access this project doesn't have.

Deliberately scoped to LIVE-discovered tools, not sample data: NETRA's
sample dataset is fictional (invented company/product names for demo
purposes — e.g. "NoteWise AI"), so resolving DNS for a sample vendor would
either fail outright or, worse, coincidentally resolve to some unrelated
real domain and produce a misleading result. GitHub App slugs
(codefactor-io, railway-app, imgbot) are real, currently-operating
products with real registered domains, so that's where this genuinely
applies — the plan's original "apply to sample data first" framing didn't
hold up once the sample data's fictional nature was checked against it.

Uses ip-api.com's free JSON endpoint (no API key required for
non-commercial use, ~45 req/min). Fails closed to "Unknown" on any error —
never guesses a country it isn't reasonably sure of.

Real limitation, stated honestly: many domains sit behind a CDN (Cloudflare,
CloudFront, etc.), so the resolved IP is the nearest CDN edge to wherever
this server happens to run, not necessarily the vendor's true origin/data-
storage location. This is a genuine DNS+GeoIP signal, not proof of where
data is actually processed — label it as such in any UI/report that shows
it, the same way "hosting_region_source" distinguishes it from a declared fact.
"""

import json
import socket
import urllib.error
import urllib.request

CANDIDATE_TLDS = ["io", "app", "com", "net", "dev", "ai"]


def _resolve_ip(domain: str):
    try:
        return socket.gethostbyname(domain)
    except (socket.gaierror, UnicodeError):
        return None


def _guess_domain_candidates(slug: str) -> list:
    """GitHub App slugs are often literally "name-tld" (e.g. "railway-app"
    for railway.app, "codefactor-io" for codefactor.io) — try treating the
    last hyphen as a dot first, since that's the highest-confidence guess,
    then fall back to trying common TLDs appended to the whole slug."""
    candidates = []
    if "-" in slug:
        base, _, suffix = slug.rpartition("-")
        if suffix in CANDIDATE_TLDS:
            candidates.append(f"{base}.{suffix}")
    for tld in CANDIDATE_TLDS:
        candidates.append(f"{slug}.{tld}")
    return candidates


def _geolocate(ip: str):
    url = f"http://ip-api.com/json/{ip}?fields=status,country,countryCode"
    try:
        with urllib.request.urlopen(url, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return None
    if data.get("status") != "success":
        return None
    return data.get("country")


def resolve_hosting_region(vendor_or_slug: str) -> dict:
    """Best-effort real DNS + IP geolocation for a live-discovered tool's
    vendor/slug. Returns {"hosting_region", "resolved_ip", "hosting_region_source"}
    — "hosting_region_source" is always set so the UI can label this
    honestly as a derived signal, never confused with a declared/known fact.
    """
    for domain in _guess_domain_candidates(vendor_or_slug.lower()):
        ip = _resolve_ip(domain)
        if not ip:
            continue
        country = _geolocate(ip)
        if country:
            return {"hosting_region": country, "resolved_ip": ip, "hosting_region_source": "geoip-lookup"}
        return {"hosting_region": "Unknown", "resolved_ip": ip, "hosting_region_source": "geoip-lookup"}

    return {"hosting_region": "Unknown", "resolved_ip": None, "hosting_region_source": "unknown"}
