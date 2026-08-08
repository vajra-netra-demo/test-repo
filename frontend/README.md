# TriNetra frontend (React + TypeScript + Tailwind)

A component-based rewrite of `backend/static/index.html` — same views, same
API calls, same visual design tokens, but as a proper Vite/React app instead
of one 1,163-line HTML file with inline `<style>`/`<script>` blocks.

## Structure

```
src/
  api/client.ts          fetch wrapper + typed API calls (one function per backend endpoint)
  types.ts                TS interfaces mirroring backend/app/schemas.py
  types/view.ts            the 4-view union type ("dashboard" | "endpoints" | "classify" | "regulation")
  lib/risk.ts              riskLevel()/RISK_COLORS shared by every chart
  components/
    Sidebar.tsx             left nav
    Badge.tsx               RiskBadge, StatusPill
    Toaster.tsx             toast context/provider (replaces #toastContainer + showToast())
    dashboard/              KpiRow, ReadinessGauge, TrendChart, DonutChart, DeptChart,
                            AccessGraph, RoiCalculator, ToolsTable, TenantBar, DashboardTopBar
    views/                  DashboardView, EndpointsView, ClassifyView, RegulationView
  App.tsx                   sidebar + active-view switch + ToastProvider
```

## Running it

```
npm install
npm run dev       # http://localhost:5173, proxies /tools, /discovery, etc. to :8000 (see vite.config.ts)
```

Run the FastAPI backend separately on port 8000 (`uvicorn app.main:app --reload` from `backend/`)
for the dev proxy to have something to talk to.

```
npm run build     # outputs dist/ — a static bundle
```

## Deploying

Two options, matching the two modes the original `index.html` already supported:

1. **Same-origin, served by FastAPI** (current production setup): build the app
   (`npm run build`) and point `backend/app/main.py`'s
   `StaticFiles(directory=STATIC_DIR, html=True)` mount at `frontend/dist`
   instead of `backend/static`. Relative API paths (`/tools`, `/discovery/status`, …)
   just work, same as today.
2. **Standalone static host** (e.g. Vercel), talking to a separately-hosted
   backend: set `VITE_API_BASE_URL` (see `.env.example`) at build time.

## What changed vs. the static HTML, and why

See the chat explanation for the full write-up — in short: components instead
of `innerHTML` string templates, typed API responses instead of trusting
`await res.json()`, React state instead of manual DOM mutation + module-level
`let` variables, and a build step (bundling, minification, tree-shaking, dev
server with HMR) instead of shipping one hand-written file byte-for-byte.

Behavioral parity was the goal — every view, chart, filter, sort, and action
(remediate, GitHub auto-revoke with its confirm dialog, live-scan polling,
CSV/evidence-report downloads) does the same thing it did in the original.
