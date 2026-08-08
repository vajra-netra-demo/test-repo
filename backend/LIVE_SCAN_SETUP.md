# Live Scan Setup

Two providers are supported. **GitHub is primary — try it first.** It needs
no eligibility gate, unlike the Microsoft 365 Developer Program sandbox,
which repeatedly rejected this team across multiple accounts. Microsoft
Graph remains as a fallback in case sandbox access ever clears.

---

## Option A — GitHub (primary, recommended)

Budget ~15-20 minutes. Needs a GitHub account (Prasanna almost certainly
already has one) — no new signup, no eligibility check.

### Step 1 — Create a free organization

1. Go to https://github.com/account/organizations/new
2. Pick the **Free** plan
3. Name it anything — e.g. `vajra-netra-demo`

### Step 2 — Install a couple of free GitHub Apps (so there's real data to find)

1. In your new org, go to **Settings → GitHub Apps** (or install directly
   from the GitHub Marketplace, filtering by "Free")
2. Install 2-3 free apps that request different permission scopes — good
   options: **Codecov**, **Dependabot** (if not already built in),
   **ImgBot**, or any small free CI/linting app
3. Grant each one access to "All repositories" or a couple of test repos —
   doesn't matter which, this is just to generate real installation data

### Step 3 — Create a Personal Access Token

1. Go to https://github.com/settings/tokens → **Tokens (classic)** → **Generate new token (classic)**
2. Name it `TriNetra Live Scan`, set an expiration
3. Check the **`admin:org`** scope (needed to list app installations)
4. Click **Generate token** and copy it immediately (shown once)

### Step 4 — Put the values in `.env`

```
GITHUB_TOKEN=<your token>
GITHUB_ORG=<your org name, e.g. vajra-netra-demo>
```

### Step 5 — Test it

```bash
python -m app.live_scan
```

You should see `Live scan complete via github: ingested N real tool(s).`
If it says 0, go back to Step 2 and install more apps.

---

## Option B — Microsoft Graph (fallback, blocked as of 2026-08-03)

This team hit "You don't currently qualify for a Microsoft 365 Developer
Program sandbox subscription" across multiple accounts — a likely
platform-side restriction, not something more attempts are expected to
fix. Only revisit this if that changes.

1. https://developer.microsoft.com/microsoft-365/dev-program → instant sandbox
2. Azure Portal → **App registrations** → New registration → note Client ID + Tenant ID
3. **Certificates & secrets** → New client secret → copy the value
4. **API permissions** → add `Application.Read.All` + `Directory.Read.All` (Application type) → **Grant admin consent**
5. Put `MS_TENANT_ID` / `MS_CLIENT_ID` / `MS_CLIENT_SECRET` in `.env`
6. Generate test OAuth grants via **Microsoft Graph Explorer** (sign in as a sandbox test user, run a few queries, accept the consent prompts)
7. `python -m app.live_scan`

---

## Reminder for the pitch

Be upfront that this is a personal test organization/tenant, not a real
company. Hosting-region data isn't available from either provider's free
tier — that's disclosed on purpose in the code and the evidence report,
not hidden. The live part is real: a real API call against a real (if
disposable/synthetic) environment, not a canned response.
