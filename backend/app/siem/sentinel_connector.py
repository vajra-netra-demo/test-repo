"""Microsoft Sentinel push connector — posts real findings into a real Log
Analytics workspace via the Azure Monitor Logs Ingestion API, so a finding
in NETRA's dashboard is genuinely queryable in a real Sentinel workspace
via KQL — not a mock, not a canned response.

Provisioned via netra-mvp/scratch_sentinel_setup.sh (Azure CLI), in the
same Azure subscription already used for the Foundry/Claude deployment.

Same silent-best-effort contract as slack_notify.py: if unconfigured or the
push fails for any reason, it's skipped — a notification failure should
never break the scan pipeline.
"""

import json
import time

import requests

from app.config import (
    SENTINEL_DCE_ENDPOINT,
    SENTINEL_DCR_IMMUTABLE_ID,
    SENTINEL_STREAM_NAME,
    SENTINEL_TENANT_ID,
    SENTINEL_CLIENT_ID,
    SENTINEL_CLIENT_SECRET,
)

_token_cache = {"token": None, "expires_at": 0}


def is_configured() -> bool:
    return bool(
        SENTINEL_DCE_ENDPOINT and SENTINEL_DCR_IMMUTABLE_ID and SENTINEL_STREAM_NAME
        and SENTINEL_TENANT_ID and SENTINEL_CLIENT_ID and SENTINEL_CLIENT_SECRET
    )


def _get_token() -> str:
    """Client-credentials token for the 'Monitoring Metrics Publisher' app
    registration, cached until shortly before expiry."""
    now = time.time()
    if _token_cache["token"] and now < _token_cache["expires_at"] - 60:
        return _token_cache["token"]

    url = f"https://login.microsoftonline.com/{SENTINEL_TENANT_ID}/oauth2/v2.0/token"
    resp = requests.post(url, data={
        "client_id": SENTINEL_CLIENT_ID,
        "client_secret": SENTINEL_CLIENT_SECRET,
        "scope": "https://monitor.azure.com/.default",
        "grant_type": "client_credentials",
    }, timeout=15)
    resp.raise_for_status()
    data = resp.json()
    _token_cache["token"] = data["access_token"]
    _token_cache["expires_at"] = now + int(data.get("expires_in", 3600))
    return _token_cache["token"]


def push_findings(tools: list) -> bool:
    """tools: list of dicts with tool_name/risk_score/risk_flags/tenant/source.
    Returns True on success, False on any failure — never raises, matching
    slack_notify.py's contract so a Sentinel outage never breaks a scan."""
    if not tools or not is_configured():
        return False

    try:
        token = _get_token()
    except Exception:
        return False

    now_iso = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
    records = [{
        "TimeGenerated": now_iso,
        "ToolName": t.get("tool_name", "Unknown"),
        "RiskScore": t.get("risk_score", 0),
        "RiskFlags": ", ".join(t.get("risk_flags") or []),
        "Tenant": t.get("tenant") or "N/A",
        "Source": t.get("source", "unknown"),
    } for t in tools]

    url = f"{SENTINEL_DCE_ENDPOINT}/dataCollectionRules/{SENTINEL_DCR_IMMUTABLE_ID}/streams/{SENTINEL_STREAM_NAME}?api-version=2023-01-01"
    try:
        resp = requests.post(
            url,
            data=json.dumps(records),
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            timeout=15,
        )
        return resp.status_code in (200, 204)
    except Exception:
        return False
