import type {
  ClassifyResult,
  ClassificationScan,
  DiscoveryStatus,
  EndpointDevice,
  ReadinessHistoryPoint,
  RegulationSearchResult,
  SaaSTool,
  ScanProgress,
  TenantProfile,
} from "../types";

// Same "deploy standalone vs. served by FastAPI" logic as the original
// index.html's inline script: same-origin dev/prod just uses relative paths;
// a separately-hosted static build (e.g. Vercel) talks to the Railway
// backend explicitly. In dev, Vite's proxy (vite.config.ts) makes relative
// paths work too, so VITE_API_BASE_URL only needs to be set for a real
// standalone static deployment.
const FALLBACK_BACKEND_URL = "https://test-repo-production-63cf.up.railway.app";

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
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

export const api = {
  // Dashboard / discovery
  getStatus: () => request<DiscoveryStatus>("/discovery/status"),
  getScanProgress: () => request<ScanProgress>("/discovery/scan-progress"),
  startLiveScan: () => request<{ status: string }>("/discovery/live-scan", { method: "POST" }),
  getEndpoints: () => request<EndpointDevice[]>("/discovery/endpoints"),

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
  evidenceReportUrl: (tenantId?: string) =>
    `${API_BASE}/report/evidence${tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : ""}`,
  csvExportUrl: (tenantId?: string) =>
    `${API_BASE}/report/csv${tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : ""}`,
};
