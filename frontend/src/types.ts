// Mirrors backend/app/schemas.py + the ad-hoc dict shapes returned by
// backend/app/routers/*.py. Keeping these as named interfaces (rather than
// trusting `any` from fetch, like the original static index.html effectively
// did) means a backend field rename fails the frontend build instead of
// silently rendering "undefined" in the UI.

export type RiskLevel = "High" | "Medium" | "Low";
export type ToolSource = "sample" | "live" | "endpoint";
export type TriageDecision = "auto-fix" | "manual-review" | "ignore";

// SaaSToolOut (backend/app/schemas.py)
export interface SaaSTool {
  id: string;
  tool_name: string;
  vendor: string;
  category: string;
  connected_via: string;
  department: string;
  connected_by_role: string;
  first_connected: string;
  last_used: string;
  monthly_active_users: number;
  oauth_scopes: string[];
  data_categories_accessed: string[];
  hosting_region: string;
  source: ToolSource;
  tenant?: string | null;
  risk_score?: number | null;
  risk_flags?: string[] | null;
  risk_reasoning?: string | null;
  remediated: boolean;
  triage_decision?: TriageDecision | null;
  triage_reasoning?: string | null;
  endpoint_device_id?: string | null;
  resolved_ip?: string | null;
  hosting_region_source: string;
}

// EndpointDeviceOut
export interface EndpointDevice {
  id: string;
  hostname: string;
  os: string;
  employee?: string | null;
  department?: string | null;
  first_checkin: string;
  last_checkin: string;
  agent_version?: string | null;
}

// ClassificationScanOut
export interface ClassificationScan {
  id: number;
  tenant?: string | null;
  label?: string | null;
  timestamp: string;
  entity_counts: Record<string, number>;
  sensitivity_score: number;
  snippet?: string | null;
}

// POST /classify/text response (routers/classify.py, not a named schema)
export interface ClassifyResult {
  scan_id: number;
  entity_counts: Record<string, number>;
  examples: Record<string, Array<{ masked_value: string; confidence: number }>>;
  sensitivity_score: number;
}

// GET /discovery/status
export interface DiscoveryStatus {
  live_scan_configured: boolean;
  provider: string | null;
  scheduler: {
    enabled: boolean;
    interval_seconds?: number;
    run_count?: number;
    last_status?: string;
  } | null;
  sentinel_configured: boolean;
}

// GET /discovery/scan-progress
export interface ScanProgress {
  running: boolean;
  last_error?: string | null;
  last_result?: { live_ingested: number; readiness_score: number } | null;
}

// GET /tenants — data/customer_profiles.json "profiles" entries
export interface TenantProfile {
  id: string;
  name: string;
  industry: string;
  employee_count: number;
  primary_framework: string;
  tagline: string;
  story: string;
}

// GET /regulation/search
export interface RegulationClause {
  framework: string;
  topic: string;
  summary: string;
  citation?: string | null;
  caveat?: string | null;
}
export interface RegulationSearchResult {
  query: string;
  results: RegulationClause[];
}

// GET /report/history
export interface ReadinessHistoryPoint {
  timestamp: string;
  triggered_by: string;
  readiness_score: number | null;
  total_tools: number;
  high_count: number;
  medium_count: number;
  low_count: number;
}
