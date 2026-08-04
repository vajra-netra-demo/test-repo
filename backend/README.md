# NETRA MVP — Backend

FastAPI + SQLAlchemy service that ingests the sample SaaS/access dataset
(`../data/sample_saas_tools.json`) and serves it over a REST API. Runs on
SQLite by default — zero setup, verified working on this machine.

## Setup

```bash
pip install -r requirements.txt
copy .env.example .env
python -m app.seed
python -m uvicorn app.main:app --reload
```

Server runs at `http://127.0.0.1:8000`. Interactive API docs at
`http://127.0.0.1:8000/docs`. **Dashboard is at `http://127.0.0.1:8000/`** (see Day 5 below).

## Endpoints (Day 2 scope)

- `GET /health` — liveness check
- `GET /tools` — list all discovered tools, optional `?department=`, `?hosting_region=`, `?source=` filters
- `GET /tools/{id}` — a single tool's full record
- `PATCH /tools/{id}/remediate` — body `{"remediated": true|false}`, marks a finding as fixed (removes its penalty from the DPDP Readiness Score, does not change the underlying risk_score)
- `GET /report/csv` — all tools as CSV (auditor/Excel-friendly), works whether or not risk-assessed

`risk_score`, `risk_flags`, and `risk_reasoning` are already in the schema
and always `null` for now — Day 3 fills them in via the LLM reasoning layer.

## Day 3 — Risk assessment

```bash
python -m app.assess_risks
```

Reads every tool, cross-references `../data/regulatory_clauses.json`, and
writes back `risk_score` / `risk_flags` / `risk_reasoning`. Safe to re-run.

**Two modes, chosen automatically:**
- If `ANTHROPIC_API_KEY` is set in `.env`, it calls the real Claude API.
- Otherwise it falls back to a transparent rule-based mock in
  `app/risk_engine.py` (dormant access + over-broad scopes + foreign
  hosting = higher score). Every mock result is prefixed
  `[MOCK MODE — heuristic, not an LLM output]` so it's never confused
  with a real model response. This has been run and verified end-to-end
  (18/18 tools scored, spread from 10 to 100, top scores match the
  riskiest sample records by design).

To switch to real LLM output:
```bash
pip install -r requirements-llm.txt
```
Then add to `.env`:
```
ANTHROPIC_API_KEY=sk-ant-...
```

Note: a ChatGPT Plus / Claude Pro **web subscription does not include API
access** — this needs a separate API key from console.anthropic.com (or
platform.openai.com), usually with its own billing. Confirm this is set up
before assuming Day 3 can run in real mode.

**Regulatory clauses are a starter set, not verified legal text.** See the
`_meta` note in `regulatory_clauses.json` — have someone confirm the actual
DPDP Act / RBI / CERT-In wording before using these citations outside the
demo.

## Day 4 — Evidence report generation

```bash
python -m app.generate_report
```

Requires Day 3 to have run first (needs `risk_score` populated). Produces
`output/netra_evidence_report.docx`: executive summary, a full findings
table, detailed per-tool remediation actions, a simplified RoPA (Record of
Processing Activities) register, and a clause appendix. Verified end-to-end
against the real seeded/assessed data (18 tools, 3 High / 11 Medium / 4 Low).

Also available live via the API for the Day 5 dashboard's "download report"
button:
```
GET /report/evidence
```
Regenerates from current DB state and streams the .docx back. Verified with
a real HTTP request (200 OK, real file bytes, not a stub).

## Day 5 — Dashboard

A single static page (`static/index.html`), served directly by FastAPI at
`/` — no React/npm build pipeline, same reasoning as SQLite-over-Postgres
(one developer, time constraints). Shows summary cards (Total/High/Medium/
Low), a filterable table (All / Sample Data / Live Scan tabs), click-to-
expand rows with full risk reasoning + scopes + hosting details, a "Run
Live Scan" button (disabled automatically if live scan isn't configured —
checked via `GET /discovery/status`), and a "Download Evidence Report"
button hitting `GET /report/evidence`.

Verified in an actual browser, not just by reading the code: summary cards
matched Day 3's numbers exactly (3 High/11 Medium/4 Low), row-expand shows
correct reasoning/scopes, the Sample/Live tab filters work (Live correctly
empty before a scan has run), and the report button triggers a real
200 OK / correct-byte-size download.

## Live scan — real data via GitHub or Microsoft Graph (optional, for the live demo)

Proves the demo isn't just a static file. Two providers, dispatched
automatically via `app/discovery_provider.py` (GitHub checked first):

- **GitHub (primary)** — real installed GitHub Apps + their granted
  permissions on a free org. No eligibility gate. Setup: **[LIVE_SCAN_SETUP.md](LIVE_SCAN_SETUP.md)**, Option A, ~15-20 min.
- **Microsoft Graph (fallback)** — blocked as of 2026-08-03: the Microsoft
  365 Developer Program sandbox rejected this team's eligibility across
  multiple accounts. Code is built and stays in place in case that clears.

```bash
python -m app.live_scan
```

or trigger it from the API (what the Day 5 dashboard button hits):
```
POST /discovery/live-scan
GET  /discovery/status     # {"live_scan_configured": true/false, "provider": "github"|"microsoft"|null}
```

**What's genuinely live (either provider):** a real API call discovering
real connected third-party apps and their real granted permissions —
proving Questions 1 & 2 (what's running, what it can touch) for real, not
from a file. GitHub's installations even carry real `created_at`/`updated_at`
timestamps, so dormancy detection is genuine there — better than the
Microsoft Graph path, whose free tier had no usable history at all.

**What's still NOT live, on purpose:** Question 3 (where the data
physically goes) needs network-layer DNS/NetFlow tracing — out of MVP
scope for both providers. `hosting_region` is explicitly marked
`"Unknown"` with the reason, never faked.

**Safe by design:** sample (`source="sample"`) and live (`source="live"`)
tools coexist in the same table — running a live scan never deletes or
overwrites the sample data, so the safe demo path always still works even
if the live setup has problems on the day. Verified: with no credentials
set, `/discovery/live-scan` returns a clean `409` with a clear message,
not a crash, and the rest of the app (seed/assess/report) is unaffected.

## Switching to Postgres

Only needed if you want a "real" database instead of the local SQLite file
(e.g. for a more production-looking demo). Not required to build or run the
MVP.

```bash
pip install -r requirements-postgres.txt
```

Then set in `.env`:
```
DATABASE_URL=postgresql+psycopg://netra:netra@localhost:5432/netra
```

No code changes needed — SQLAlchemy handles both via the same models/routes.
