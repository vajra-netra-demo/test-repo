"""Splunk HTTP Event Collector (HEC) push connector — same shape and
contract as sentinel_connector.py, coded against Splunk's real, documented
HEC API (POST {url}/services/collector/event, "Authorization: Splunk
<token>" header, JSON event payload).

Unlike Sentinel, this one is genuinely NOT activated — the team has no
real Splunk instance or HEC token to test against, only ESDS's Azure
subscription for Sentinel. Built and shaped correctly per Splunk's own
docs, but is_configured() returns False until real credentials exist —
same "build now, activate later" pattern as manageengine_discovery.py /
google_workspace_discovery.py. Don't claim this is verified working; only
Sentinel has been proven end-to-end (a real push confirmed queryable via
KQL). Confirm this one is genuinely inert (is_configured() == False)
before demoing, rather than implying it's live.
"""

import json
import time

import requests

from app.config import SPLUNK_HEC_URL, SPLUNK_HEC_TOKEN

SPLUNK_INDEX = "netra_findings"
SPLUNK_SOURCETYPE = "netra:finding"


def is_configured() -> bool:
    return bool(SPLUNK_HEC_URL and SPLUNK_HEC_TOKEN)


def push_findings(tools: list) -> bool:
    """tools: list of dicts with tool_name/risk_score/risk_flags/tenant/source.
    Returns True on success, False on any failure — never raises, same
    silent-best-effort contract as slack_notify.py and sentinel_connector.py."""
    if not tools or not is_configured():
        return False

    url = f"{SPLUNK_HEC_URL.rstrip('/')}/services/collector/event"
    now_epoch = time.time()
    events = [{
        "time": now_epoch,
        "sourcetype": SPLUNK_SOURCETYPE,
        "index": SPLUNK_INDEX,
        "event": {
            "tool_name": t.get("tool_name", "Unknown"),
            "risk_score": t.get("risk_score", 0),
            "risk_flags": t.get("risk_flags") or [],
            "tenant": t.get("tenant") or "N/A",
            "source": t.get("source", "unknown"),
        },
    } for t in tools]

    # HEC expects one JSON object per event, concatenated (not a JSON array).
    body = "\n".join(json.dumps(e) for e in events)

    try:
        resp = requests.post(
            url,
            data=body,
            headers={"Authorization": f"Splunk {SPLUNK_HEC_TOKEN}", "Content-Type": "application/json"},
            timeout=15,
        )
        return resp.status_code == 200
    except Exception:
        return False
