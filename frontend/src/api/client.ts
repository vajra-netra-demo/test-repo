import type {
  AppUser,
  AttackMapping,
  ClassifyResult,
  ClassificationScan,
  DiscoveryStatus,
  AttackPaths,
  EmployeeProfile,
  EmployeeSummary,
  EndpointDevice,
  GraphInsights,
  LoginResponse,
  PermissionChanges,
  ReadinessHistoryPoint,
  RedAgentFinding,
  RegulationSearchResult,
  RiskChanges,
  SaaSTool,
  ScanProgress,
  TenantProfile,
  UserRole,
} from "../types";

// Same "deploy standalone vs. served by FastAPI" logic as the original
// index.html's inline script: same-origin dev/prod just uses relative paths;
// a separately-hosted static build (e.g. Vercel) talks to the Railway
// backend explicitly. In dev, Vite's proxy (vite.config.ts) makes relative
// paths work too, so VITE_API_BASE_URL only needs to be set for a real
// standalone static deployment.
const FALLBACK_BACKEND_URL = "https://test-repo-production-1d80.up.railway.app";

function resolveApiBase(): string {
  const configured = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (configured) return configured;

  const origin = window.location.origin;
  const sameOrigin =
    origin.startsWith("http://localhost") ||
    origin.startsWith("http://127.0.0.1") ||
    origin === FALLBACK_BACKEND_URL;
  return sameOrigin ? "" : FALLBACK_BACKEND_URL;
}

export const API_BASE = resolveApiBase();

export class ApiError extends Error {
  status: number;
  detail?: unknown;

  constructor(message: string, status: number, detail?: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

// Every route except /auth/login and /health now requires a bearer token
// (backend/app/auth.py, merged from Dev). The token lives here + localStorage
// rather than in AuthProvider's React state, so a plain fetch() elsewhere
// (or a page that hasn't mounted the provider yet) still has access to it.
const TOKEN_KEY = "netra-token";
let authToken: string | null = localStorage.getItem(TOKEN_KEY);
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getAuthToken() {
  return authToken;
}

// AuthProvider registers itself here so a 401 from *any* call — not just
// the ones AuthProvider makes directly — clears the session and bounces to
// the login screen, matching Dev's "global fetch() wrapper ... bounces back
// to login on any 401" behavior.
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (res.status === 401 && path !== "/auth/login") {
    setAuthToken(null);
    onUnauthorized?.();
  }
  if (!res.ok) {
    let detail: unknown;
    try {
      detail = await res.json();
    } catch {
      /* body wasn't JSON */
    }
    const message =
      (detail as { detail?: string } | undefined)?.detail ?? `${res.status} ${res.statusText}`;
    throw new ApiError(message, res.status, detail);
  }
  return res.json() as Promise<T>;
}

// CSV/evidence-report downloads can't use window.location.assign anymore —
// that can't carry an Authorization header, and these routes are now
// behind auth. Fetch as a blob and save it via a throwaway <a download>
// instead (same approach Dev's original static-HTML version switched to).
async function downloadFile(path: string, fallbackFilename: string): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
  });
  if (res.status === 401) {
    setAuthToken(null);
    onUnauthorized?.();
  }
  if (!res.ok) {
    let detail: unknown;
    try {
      detail = await res.json();
    } catch {
      /* body wasn't JSON */
    }
    const message = (detail as { detail?: string } | undefined)?.detail ?? `${res.status} ${res.statusText}`;
    throw new ApiError(message, res.status, detail);
  }

  const disposition = res.headers.get("Content-Disposition") ?? "";
  const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
  const filename = filenameMatch?.[1] ?? fallbackFilename;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  // Auth
  login: (username: string, password: string) =>
    request<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  me: () => request<LoginResponse>("/auth/me"),

  // Account management (admin-only on the backend)
  listUsers: () => request<AppUser[]>("/auth/users"),
  createUser: (username: string, password: string, role: UserRole) =>
    request<AppUser>("/auth/users", {
      method: "POST",
      body: JSON.stringify({ username, password, role }),
    }),
  deleteUser: (username: string) =>
    request<{ deleted: string }>(`/auth/users/${encodeURIComponent(username)}`, { method: "DELETE" }),

  // Dashboard / discovery
  getStatus: () => request<DiscoveryStatus>("/discovery/status"),
  getScanProgress: () => request<ScanProgress>("/discovery/scan-progress"),
  startLiveScan: () => request<{ status: string }>("/discovery/live-scan", { method: "POST" }),
  cancelScan: () => request<{ status: string }>("/discovery/scan-cancel", { method: "POST" }),
  getEndpoints: () => request<EndpointDevice[]>("/discovery/endpoints"),
  getGraphInsights: (tenant?: string) =>
    request<GraphInsights>(`/discovery/access-graph-insights${tenant ? `?tenant=${encodeURIComponent(tenant)}` : ""}`),
  getAttackPaths: (tenant?: string) =>
    request<AttackPaths>(`/discovery/attack-paths${tenant ? `?tenant=${encodeURIComponent(tenant)}` : ""}`),
  getRiskChanges: (tenant?: string) =>
    request<RiskChanges>(`/discovery/risk-changes${tenant ? `?tenant=${encodeURIComponent(tenant)}` : ""}`),
  getPermissionChanges: (tenant?: string) =>
    request<PermissionChanges>(`/discovery/permission-changes${tenant ? `?tenant=${encodeURIComponent(tenant)}` : ""}`),
  getRedAgentFindings: () => request<RedAgentFinding[]>("/discovery/red-agent-runs"),

  // Employees (per-employee drill-down + offboarding — derived entirely
  // from EndpointDevice.employee, no separate employee directory exists)
  getEmployees: () => request<EmployeeSummary[]>("/discovery/employees"),
  getEmployeeProfile: (employee: string) =>
    request<EmployeeProfile>(`/discovery/employees/${encodeURIComponent(employee)}/profile`),
  offboardEmployee: (employee: string, note: string | null = null) =>
    request<EmployeeProfile>(`/discovery/employees/${encodeURIComponent(employee)}/offboard`, {
      method: "POST",
      body: JSON.stringify({ note }),
    }),
  undoOffboardEmployee: (employee: string) =>
    request<EmployeeProfile>(`/discovery/employees/${encodeURIComponent(employee)}/offboard`, { method: "DELETE" }),

  // Tools
  getTools: (tenant?: string) =>
    request<SaaSTool[]>(`/tools${tenant ? `?tenant=${encodeURIComponent(tenant)}` : ""}`),
  setRemediated: (id: string, remediated: boolean) =>
    request<SaaSTool>(`/tools/${encodeURIComponent(id)}/remediate`, {
      method: "PATCH",
      body: JSON.stringify({ remediated }),
    }),
  autoFixTool: (id: string) =>
    request<{ revoked: boolean; tool_id: string; readiness_score: number }>(
      `/tools/${encodeURIComponent(id)}/auto-fix`,
      { method: "POST" },
    ),
  getAttackMapping: (id: string) => request<AttackMapping>(`/tools/${encodeURIComponent(id)}/attack-mapping`),

  // Tenants
  getTenants: () => request<TenantProfile[]>("/tenants"),

  // Classification
  classifyText: (text: string, label: string | null) =>
    request<ClassifyResult>("/classify/text", {
      method: "POST",
      body: JSON.stringify({ text, label }),
    }),
  getClassifyHistory: (limit = 20) =>
    request<ClassificationScan[]>(`/classify/history?limit=${limit}`),

  // Regulation search
  searchRegulation: (query: string, k = 5) =>
    request<RegulationSearchResult>(
      `/regulation/search?q=${encodeURIComponent(query)}&k=${k}`,
    ),

  // Reports
  getHistory: () => request<ReadinessHistoryPoint[]>("/report/history"),
  downloadEvidenceReport: (tenantId?: string) =>
    downloadFile(
      `/report/evidence${tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : ""}`,
      "netra_evidence_report.docx",
    ),
  downloadCsv: (tenantId?: string) =>
    downloadFile(`/report/csv${tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : ""}`, "netra_discovered_tools.csv"),
};
