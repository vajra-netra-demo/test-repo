# NETRA Endpoint Discovery Agent

Read-only. Reports what OAuth-based discovery structurally cannot see:
locally-installed browser extensions (Chrome/Edge) and installed software,
from whichever machine it runs on.

## What it does

- Reads Chrome/Edge extension `manifest.json` files directly from disk (no
  browser API needed) — including the real `permissions`/`host_permissions`
  arrays, so an extension holding `<all_urls>` (read access to every page)
  gets flagged by the same broad-scope logic that already flags an
  over-permissioned OAuth grant.
- Reads installed software from the Windows registry (`Uninstall` keys) or
  Linux package managers (`dpkg`/`rpm`).
- POSTs the result to `POST /discovery/endpoint-report` on your NETRA
  backend, authenticated with a shared bearer token.

## What it deliberately does NOT do

- Does not install, remove, block, or modify anything. There is no
  push-install or block-extension capability — that would need signed
  installers, elevated privileges, and a real device fleet to test against,
  which is out of scope here. If asked in a demo, say so directly rather
  than implying otherwise.
- Does not scan macOS installed software (not implemented — extension
  scanning still works there via Chrome's user-data path).
- Does not read file contents, browsing history, or anything beyond an
  extension's own declared manifest and the OS's own installed-programs list.

## Setup

1. On the NETRA backend, set `ENDPOINT_AGENT_TOKEN` in `.env` (any random
   string — treat it like a password) and restart the server.
2. Run once manually to confirm it works:
   ```
   python netra_agent.py --backend-url http://127.0.0.1:8200 --token <your-token>
   ```
   `--employee` is optional — if you don't pass it, the agent uses the
   OS-logged-in username on that machine automatically. That's the point:
   **the exact same command/task can be copied to every machine unchanged**
   — nobody has to edit a name into it per-device. Pass `--employee "Name"`
   only if the OS username isn't a good label (e.g. a shared/service account).
   Add `--dry-run` first if you just want to see what it would report
   without submitting anything.
3. Schedule it to run automatically — use the identical command on every
   machine you enroll:

### Windows (Task Scheduler)

```
schtasks /create /tn "NETRA Endpoint Agent" /tr "python C:\path\to\netra_agent.py --backend-url http://127.0.0.1:8200 --token YOUR_TOKEN" /sc daily /st 23:00
```

### Linux (cron)

```
crontab -e
# add:
0 23 * * * /usr/bin/python3 /path/to/netra_agent.py --backend-url http://127.0.0.1:8200 --token YOUR_TOKEN
```

## Data it sends

Only what's in the manifest/registry: extension/software name, vendor,
version, declared permissions, and an install date if the OS reports one —
plus the hostname, the OS-logged-in username (or an explicit `--employee`
label if you passed one), and `--department` if you passed one. No file
content, no browsing history, no credentials.

## Where that data ends up in the dashboard

- `POST /discovery/endpoint-report` upserts one `EndpointDevice` row (host,
  OS, employee, department, first/last check-in, agent version) and replaces
  that device's `SaaSTool` rows (`source="endpoint"`) — one row per
  extension/software finding, each carrying its name/vendor/permissions.
- **Endpoint Devices** view: one row per device, from `GET /discovery/endpoints`.
- **Employees** view: one row per distinct employee name seen across all
  devices, with a device/tool count and a drill-down showing every finding
  on their device(s), each with its real risk score/flags/triage decision.
- Every endpoint finding also flows through the same pipeline as any other
  discovered tool: it appears in **Tools**, gets a real Claude-scored risk
  entry, feeds the **Graph Insights** department↔tool↔category graph, gets
  matched against **MITRE ATT&CK** techniques and **regulatory clauses**,
  and is included in **CSV/evidence exports** — no special-casing.
