// Mirrors backend/app/schemas.py + the ad-hoc dict shapes returned by
// backend/app/routers/*.py. Keeping these as named interfaces (rather than
// trusting `any` from fetch, like the original static index.html effectively
// did) means a backend field rename fails the frontend build instead of
// silently rendering "undefined" in the UI.

export type RiskLevel = "High" | "Medium" | "Low";
export type ToolSource = "sample" | "live" | "endpoint";
export type TriageDecision = "auto-fix" | "manual-review" | "ignore";
export type UserRole = "admin" | "viewer";

// POST /auth/login, GET /auth/me (backend/app/routers/auth.py)
export interface LoginResponse {
  access_token: string;
  token_type: string;
  username: string;
  role: UserRole;
}

// GET/POST /auth/users (admin-only)
export interface AppUser {
  username: string;
  role: UserRole;
}

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
  // Real DNS resolution + GeoIP lookup, and a real TLS handshake reading the
  // server's actual certificate (backend/app/network_intel.py) — populated
  // only for live-discovered tools with a resolvable domain (GitHub App
  // slugs etc.), never for the fictional sample dataset. hosting_region_source
  // distinguishes a real network signal ("geoip-lookup") from a merely
  // declared value ("declared") or a failed lookup ("unknown") — always show
  // it alongside hosting_region, never present GeoIP as fact.
  resolved_ip?: string | null;
  hosting_region_source: string;
  tls_issuer_org?: string | null;
  tls_subject_org?: string | null;
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

// GET /discovery/employees (backend/app/schemas.py EmployeeSummary)
export interface EmployeeSummary {
  employee: string;
  department?: string | null;
  device_count: number;
  tool_count: number;
  high_risk_count: number;
  offboarded: boolean;
  offboarded_date?: string | null;
}

// GET /discovery/employees/{employee}/profile (EmployeeProfile)
export interface EmployeeProfile {
  employee: string;
  devices: EndpointDevice[];
  tools: SaaSTool[];
  offboarded: boolean;
  offboarded_date?: string | null;
  offboard_note?: string | null;
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
  phase?: string;
  processed?: number;
  total?: number;
  current_tool?: string | null;
  cancelled?: boolean;
}

// GET /tools/{id}/attack-mapping
export interface AttackTechnique {
  technique_id: string;
  technique_name: string;
  tactic: string;
  rationale: string;
  matched_flag: string | null;
}

export interface AttackMapping {
  tool_id: string;
  tool_name: string;
  risk_flags: string[];
  techniques: AttackTechnique[];
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

// GET /discovery/access-graph-insights (backend/app/graph_analysis.py
// compute_graph_insights) — real NetworkX metrics over the dept/tool/
// data-category graph, not illustrative counts.
export interface GraphInsightTool {
  tool_name: string;
  score: number;
  risk_score?: number | null;
  departments_and_categories_touched: number;
}
export interface GraphInsights {
  node_count: number;
  edge_count: number;
  connected_components: number;
  largest_component_size: number;
  most_central_tools: GraphInsightTool[];
  bridge_tools: GraphInsightTool[];
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
