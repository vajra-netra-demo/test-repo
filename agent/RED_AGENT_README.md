# TriNetra Red Agent

A small, deliberately scoped attack-simulation counterpart to the passive
discovery agent (`netra_agent.py`). It exists to prove, end-to-end, that
TriNetra can receive and correctly label a real MITRE ATT&CK technique
execution — not to demonstrate offensive capability.

## What it does

Executes exactly five real MITRE ATT&CK techniques, every one of them from
the **Discovery tactic only** — plain, read-only enumeration commands:

| Technique | ID | Command (Windows / Linux) |
|---|---|---|
| System Information Discovery | T1082 | `systeminfo` / `uname -a` |
| System Owner/User Discovery | T1033 | `whoami` / `whoami` |
| Account Discovery: Local Account | T1087.001 | `net user` / `cat /etc/passwd` |
| System Network Configuration Discovery | T1016 | `ipconfig /all` / `ip addr` |
| Permission Groups Discovery: Local Groups | T1069.001 | `net localgroup administrators` / `getent group sudo` |

Each real command's real output (capped at 2,000 characters) is POSTed to
`POST /discovery/red-agent-report` on your TriNetra backend, along with the
real technique ID/name/tactic and the hostname/OS it ran on.

## What it deliberately does NOT do

This is a hard boundary, not a starting point to expand from:

- No credential access, dumping, or use of any kind.
- No persistence, scheduled-task creation, or registry/startup modification.
- No lateral movement — it never reaches any machine other than the one
  running it.
- No destructive action of any kind — every command listed above is a
  standard, read-only enumeration command any logged-in user can already run.

The project deliberately walked back a "Jatayu Red Team" attack-simulation
framing once before (see `app/attack_mapping.py`'s docstring) for having no
connection to TriNetra's actual discovery/governance thesis. This script is
the one narrow, explicit exception — real technique IDs, real commands, real
output, but nothing outside the Discovery tactic.

**Run this only against a machine you own and have explicit authority to
test.** By default that's simply the machine you run it on.

## Setup

1. On the TriNetra backend, set `RED_AGENT_TOKEN` in `.env` (any random
   string) and restart the server.
2. Run it:
   ```
   python red_agent.py --backend-url http://127.0.0.1:8200 --token <your-token>
   ```

## Where that data ends up in the dashboard

`POST /discovery/red-agent-report` appends one `RedAgentFinding` row per
technique per run (grouped by a generated `run_id`) — an append-only log,
never overwritten. The **Risk Insights → Red Agent** panel groups findings
by run and shows each technique's real captured output.
