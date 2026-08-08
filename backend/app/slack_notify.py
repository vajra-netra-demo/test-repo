"""Real Slack alerting via Incoming Webhook — posts when a live scan
discovers a new High-risk tool.

This is a genuine integration (a real HTTP POST to a real Slack channel),
not a simulation — the same "prove it actually works" standard as the
GitHub live-scan and Auto-Fix features. Optional: if SLACK_WEBHOOK_URL is
unset, notification is silently skipped, same pattern as live-scan
providers being optional.
"""

import requests

from app.config import SLACK_WEBHOOK_URL


def is_configured() -> bool:
    return bool(SLACK_WEBHOOK_URL)


def send_message(text: str) -> bool:
    """Posts a plain-text message to the configured Slack channel.
    Returns True on success, False on any failure (never raises — a
    notification failure should never break the scan pipeline)."""
    if not is_configured():
        return False
    try:
        resp = requests.post(SLACK_WEBHOOK_URL, json={"text": text}, timeout=10)
        return resp.status_code == 200
    except Exception:
        return False


def notify_high_risk_findings(tools: list) -> bool:
    """tools: list of dicts with tool_name/risk_score/risk_flags, already
    filtered to High risk. Sends one summary message, not one per tool, to
    avoid alert spam on a channel."""
    if not tools:
        return False

    lines = [f"🚨 *TriNetra Live Scan Alert* — {len(tools)} High-risk tool(s) found:"]
    for t in tools[:10]:
        flags = ", ".join(t.get("risk_flags") or [])
        lines.append(f"• *{t['tool_name']}* — score {t['risk_score']}/100 ({flags})")
    if len(tools) > 10:
        lines.append(f"...and {len(tools) - 10} more.")
    lines.append("Review in the TriNetra dashboard and mark as remediated or investigate further.")

    return send_message("\n".join(lines))
