"""TriNetra Red Agent — a small, deliberately scoped attack-simulation
counterpart to the passive discovery agents (github_discovery.py,
netra_agent.py).

This is NOT a general-purpose attack-simulation framework, and it is not
Atomic Red Team. It executes a fixed, hardcoded list of five real MITRE
ATT&CK techniques, every one of them from the Discovery tactic — plain,
read-only enumeration commands (whoami, listing local accounts, reading
network config, ...) with no capability to access credentials, move
laterally, establish persistence, or modify anything on the machine it
runs on. The point is a genuine, end-to-end proof that TriNetra can
receive and correctly label a real adversary-technique execution — not a
demonstration of offensive capability.

The project deliberately walked back a "Jatayu Red Team" attack-simulation
framing once before (see app/attack_mapping.py's docstring) because it had
no connection to TriNetra's actual discovery/governance thesis. This
script is the one narrow, explicit exception: real technique IDs, real
commands, real output — but nothing outside the Discovery tactic, and
nothing that touches a system other than the one running this script.

Run this ONLY against a machine you own and have explicit authority to
test. By default that is simply the machine you run it on.

Usage:
    python red_agent.py --backend-url https://your-backend --token <RED_AGENT_TOKEN>
"""

import argparse
import json
import platform
import socket
import subprocess
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone

# Real command output can be long (systeminfo, ipconfig /all); capped so a
# single run can't balloon the report payload or the dashboard's display.
MAX_OUTPUT_CHARS = 2000

# Every technique here belongs to the MITRE ATT&CK Discovery tactic only —
# read-only enumeration, nothing that reads credentials, writes anything,
# or reaches another machine. See this file's docstring for why that's a
# hard boundary, not a starting point to expand from casually.
TECHNIQUES = [
    {
        "technique_id": "T1082",
        "technique_name": "System Information Discovery",
        "tactic": "Discovery",
        "windows": ["systeminfo"],
        "linux": ["uname", "-a"],
    },
    {
        "technique_id": "T1033",
        "technique_name": "System Owner/User Discovery",
        "tactic": "Discovery",
        "windows": ["whoami"],
        "linux": ["whoami"],
    },
    {
        "technique_id": "T1087.001",
        "technique_name": "Account Discovery: Local Account",
        "tactic": "Discovery",
        "windows": ["net", "user"],
        "linux": ["cat", "/etc/passwd"],
    },
    {
        "technique_id": "T1016",
        "technique_name": "System Network Configuration Discovery",
        "tactic": "Discovery",
        "windows": ["ipconfig", "/all"],
        "linux": ["ip", "addr"],
    },
    {
        "technique_id": "T1069.001",
        "technique_name": "Permission Groups Discovery: Local Groups",
        "tactic": "Discovery",
        "windows": ["net", "localgroup", "administrators"],
        "linux": ["getent", "group", "sudo"],
    },
]


def _run_technique(spec: dict) -> dict:
    is_windows = platform.system().lower() == "windows"
    cmd = spec["windows"] if is_windows else spec["linux"]
    try:
        completed = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        output = (completed.stdout or completed.stderr or "").strip()
    except (OSError, subprocess.SubprocessError) as e:
        output = f"[could not run: {e}]"
    return {
        "technique_id": spec["technique_id"],
        "technique_name": spec["technique_name"],
        "tactic": spec["tactic"],
        "command": " ".join(cmd),
        "output_snippet": output[:MAX_OUTPUT_CHARS],
        "executed_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


def run_simulation() -> list:
    results = []
    total = len(TECHNIQUES)
    for i, spec in enumerate(TECHNIQUES, start=1):
        print(f"[{i}/{total}] Executing {spec['technique_id']} - {spec['technique_name']}...", flush=True)
        result = _run_technique(spec)
        results.append(result)
        print(f"      captured {len(result['output_snippet'])} chars of real output", flush=True)
    return results


def submit(backend_url: str, token: str, run_id: str, results: list) -> dict:
    body = json.dumps({
        "run_id": run_id,
        "hostname": socket.gethostname(),
        "os": platform.system().lower(),
        "results": results,
    }).encode("utf-8")
    req = urllib.request.Request(
        f"{backend_url.rstrip('/')}/discovery/red-agent-report",
        data=body,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main():
    parser = argparse.ArgumentParser(
        description="TriNetra Red Agent - five real, benign MITRE ATT&CK Discovery-tactic techniques, nothing more."
    )
    parser.add_argument("--backend-url", required=True)
    parser.add_argument("--token", required=True)
    args = parser.parse_args()

    run_id = str(uuid.uuid4())
    print(f"TriNetra Red Agent - run {run_id}")
    print(f"Target: {socket.gethostname()} ({platform.system()})")
    print(f"Executing {len(TECHNIQUES)} real, benign MITRE ATT&CK Discovery-tactic techniques only.")
    print("No credential access, persistence, or lateral movement is performed.\n")

    results = run_simulation()

    print(f"\n[{len(results)}/{len(results)}] Submitting results to backend...", flush=True)
    try:
        response = submit(args.backend_url, args.token, run_id, results)
    except urllib.error.URLError as e:
        print(f"Submit failed: {e}")
        return

    print(f"[100%] Done — {response['techniques_recorded']} technique executions recorded for run {response['run_id']}")


if __name__ == "__main__":
    main()
