"""DNS + IP geolocation, plus real TLS certificate inspection — an honest,
lightweight substitute for real network-tap/NetFlow capture, which needs
corporate network infrastructure access this project doesn't have.

TLS certificate inspection (inspect_tls_certificate) is a second, independent
network-layer signal alongside DNS/GeoIP: it performs a real TLS handshake
against the resolved domain and reads the server's actual certificate —
issuer and subject organization, validity window. This is genuine network
data (not a declared/self-reported value), and it corroborates or contradicts
the GeoIP guess (e.g. a cert issued to a company headquartered elsewhere is
another real signal, independent of where the IP geolocates). It is still
NOT real NetFlow/packet capture — no traffic content is inspected, only the
handshake's own certificate — so this stays an honest complement to DNS/
GeoIP, not a claim of full network visibility.

Deliberately scoped to LIVE-discovered tools, not sample data: TriNetra's
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
import ssl
import urllib.error
import urllib.request

CANDIDATE_TLDS = ["io", "app", "com", "net", "dev", "ai"]

# Placeholder values a discovery provider uses when it genuinely doesn't
# know the vendor (e.g. Microsoft Graph's publisherName can be empty) —
# NOT a real vendor name to guess a domain for. Found the hard way:
# "unknown.io" is a real, registered (unrelated, parked) domain, so without
# this guard the resolver confidently reports a real-looking but completely
# meaningless hosting region/certificate for any tool whose vendor is
# simply unknown.
_PLACEHOLDER_VENDORS = {"unknown", "n/a", "none", ""}


def _cert_name_field(name_tuples, field):
    """A cert's subject/issuer is a tuple of tuples of single-item tuples,
    e.g. (((\"organizationName\", \"GitHub, Inc.\"),), ((\"commonName\", \"github.com\"),))."""
    for rdn in name_tuples or ():
        for key, value in rdn:
            if key == field:
                return value
    return None


def inspect_tls_certificate(domain: str, timeout: float = 5.0):
    """Real TLS handshake against domain:443 — reads the server's actual
    certificate. Returns None on any failure (fails closed, same discipline
    as the rest of this module) rather than guessing."""
    try:
        ctx = ssl.create_default_context()
        with socket.create_connection((domain, 443), timeout=timeout) as sock:
            with ctx.wrap_socket(sock, server_hostname=domain) as tls_sock:
                cert = tls_sock.getpeercert()
    except (socket.error, ssl.SSLError, TimeoutError, OSError):
        return None

    if not cert:
        return None

    return {
        "tls_issuer_org": _cert_name_field(cert.get("issuer"), "organizationName"),
        "tls_subject_org": _cert_name_field(cert.get("subject"), "organizationName"),
        "tls_subject_cn": _cert_name_field(cert.get("subject"), "commonName"),
        "tls_valid_from": cert.get("notBefore"),
        "tls_valid_to": cert.get("notAfter"),
    }


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
    """Best-effort real DNS + IP geolocation, plus a real TLS certificate
    read, for a live-discovered tool's vendor/slug. Returns
    {"hosting_region", "resolved_ip", "hosting_region_source", "tls_issuer_org",
    "tls_subject_org"} — "hosting_region_source" is always set so the UI can
    label this honestly as a derived signal, never confused with a declared/
    known fact. The tls_* fields are None whenever the handshake fails
    (self-signed/expired certs, TLS not offered, firewalled, etc.) — fails
    closed like everything else here.
    """
    if (vendor_or_slug or "").strip().lower() in _PLACEHOLDER_VENDORS:
        return {"hosting_region": "Unknown", "resolved_ip": None, "hosting_region_source": "unknown",
                "tls_issuer_org": None, "tls_subject_org": None}

    for domain in _guess_domain_candidates(vendor_or_slug.lower()):
        ip = _resolve_ip(domain)
        if not ip:
            continue
        tls = inspect_tls_certificate(domain) or {}
        country = _geolocate(ip)
        base = {"resolved_ip": ip, "tls_issuer_org": tls.get("tls_issuer_org"), "tls_subject_org": tls.get("tls_subject_org")}
        if country:
            return {**base, "hosting_region": country, "hosting_region_source": "geoip-lookup"}
        return {**base, "hosting_region": "Unknown", "hosting_region_source": "geoip-lookup"}

    return {"hosting_region": "Unknown", "resolved_ip": None, "hosting_region_source": "unknown",
            "tls_issuer_org": None, "tls_subject_org": None}
