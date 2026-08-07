import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import type { DiscoveryStatus, ReadinessHistoryPoint, RiskLevel, SaaSTool, ScanProgress, TenantProfile } from "../../types";
import { riskLevel } from "../../lib/risk";
import { useToast } from "../Toaster";
import { DashboardTopBar } from "../dashboard/DashboardTopBar";
import { ScanProgressBanner } from "../dashboard/ScanProgressBanner";
import { TenantBar } from "../dashboard/TenantBar";
import { ReadinessGauge } from "../dashboard/ReadinessGauge";
import { TrendChart } from "../dashboard/TrendChart";
import { ScanHistoryTable } from "../dashboard/ScanHistoryTable";
import { KpiRow, type KpiFilter } from "../dashboard/KpiRow";
import { DonutChart } from "../dashboard/DonutChart";
import { DeptChart } from "../dashboard/DeptChart";
import { RoiCalculator } from "../dashboard/RoiCalculator";
import { LicenseWastePanel } from "../dashboard/LicenseWastePanel";
import { AccessGraph } from "../dashboard/AccessGraph";
import { GraphInsightsPanel } from "../dashboard/GraphInsightsPanel";
import { AttackPathPanel } from "../dashboard/AttackPathPanel";
import { RiskAlertsModal } from "../dashboard/RiskAlertsModal";
import { ToolsTable } from "../dashboard/ToolsTable";
import type { AttackPaths, GraphInsights } from "../../types";

function counts(tools: SaaSTool[]): Record<RiskLevel, number> {
  return {
    High: tools.filter((t) => riskLevel(t.risk_score) === "High").length,
    Medium: tools.filter((t) => riskLevel(t.risk_score) === "Medium").length,
    Low: tools.filter((t) => riskLevel(t.risk_score) === "Low").length,
  };
}

export function DashboardView() {
  const { showToast } = useToast();
  const { isAdmin } = useAuth();

  const [status, setStatus] = useState<DiscoveryStatus | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);

  const [tenantProfiles, setTenantProfiles] = useState<TenantProfile[]>([]);
  const [currentTenant, setCurrentTenant] = useState("");

  const [tools, setTools] = useState<SaaSTool[]>([]);
  const [history, setHistory] = useState<ReadinessHistoryPoint[]>([]);
  const [graphInsights, setGraphInsights] = useState<GraphInsights | null>(null);
  const [graphInsightsLoading, setGraphInsightsLoading] = useState(true);
  const [attackPaths, setAttackPaths] = useState<AttackPaths | null>(null);
  const [attackPathsLoading, setAttackPathsLoading] = useState(true);
  const [riskFilter, setRiskFilter] = useState<KpiFilter>("all");
  const [alertsModalFilter, setAlertsModalFilter] = useState<KpiFilter | null>(null);
  const toolsTableRef = useRef<HTMLDivElement>(null);

  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const data = await api.getStatus();
      setStatus(data);
      setStatusError(false);
    } catch {
      setStatusError(true);
    }
  }, []);

  const loadTools = useCallback(async (tenant: string) => {
    const data = await api.getTools(tenant || undefined);
    setTools(data);
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await api.getHistory());
    } catch {
      /* trend is best-effort, matching the original's silent catch */
    }
  }, []);

  const loadGraphInsights = useCallback(async (tenant: string) => {
    setGraphInsightsLoading(true);
    try {
      setGraphInsights(await api.getGraphInsights(tenant || undefined));
    } catch {
      /* best-effort, same as the trend chart above — a graph-metrics hiccup
         shouldn't block the rest of the dashboard from rendering */
      setGraphInsights(null);
    } finally {
      setGraphInsightsLoading(false);
    }
  }, []);

  const loadAttackPaths = useCallback(async (tenant: string) => {
    setAttackPathsLoading(true);
    try {
      setAttackPaths(await api.getAttackPaths(tenant || undefined));
    } catch {
      /* best-effort, same as graph insights above */
      setAttackPaths(null);
    } finally {
      setAttackPathsLoading(false);
    }
  }, []);

  const reload = useCallback(async () => {
    await Promise.all([
      loadTools(currentTenant),
      loadHistory(),
      loadGraphInsights(currentTenant),
      loadAttackPaths(currentTenant),
    ]);
  }, [currentTenant, loadTools, loadHistory, loadGraphInsights, loadAttackPaths]);

  useEffect(() => {
    loadStatus();
    api.getTenants().then(setTenantProfiles).catch(() => {});
    // Catches a scan already running when this page loads — e.g. started
    // by the scheduler's auto re-scan, or from another browser tab — not
    // just ones this session's own "Run Live Scan" click kicked off.
    api
      .getScanProgress()
      .then((data) => {
        if (data.running) {
          setScanning(true);
          setScanProgress(data);
          pollScanProgress();
        } else {
          // No reload() here — the other mount-time effects (loadTools,
          // loadHistory, etc.) already fetch fresh data on this same
          // mount; this just surfaces the toast for a completion that
          // may otherwise have gone unseen. See notifyScanResult below.
          notifyScanResult(data);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadStatus]);

  useEffect(() => {
    loadTools(currentTenant);
    loadGraphInsights(currentTenant);
    loadAttackPaths(currentTenant);
  }, [currentTenant, loadTools, loadGraphInsights, loadAttackPaths]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => () => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
  }, []);

  // Dedups by finished_at so the same completed scan doesn't re-toast
  // every time this page mounts/reloads — persisted to localStorage so a
  // page reload doesn't reset the "already told the user about this one"
  // memory. Needed because a scan can finish while nobody's actively
  // polling (tab reloaded, or DashboardView unmounted from a sidebar nav
  // and remounted after a long real scan — e.g. Celery-parallelized
  // across hundreds of tools — completed in the background); without
  // this, that completion was silently swallowed.
  const LAST_NOTIFIED_SCAN_KEY = "netra-last-scan-notified";
  function notifyScanResult(data: ScanProgress) {
    if (data.finished_at) {
      if (localStorage.getItem(LAST_NOTIFIED_SCAN_KEY) === data.finished_at) return;
      localStorage.setItem(LAST_NOTIFIED_SCAN_KEY, data.finished_at);
    }
    if (data.last_error) {
      showToast(`Live scan failed: ${data.last_error}`, "error");
    } else if (data.last_result?.cancelled) {
      showToast(
        `Scan stopped — kept ${data.last_result.live_ingested} real tool(s) assessed so far. Readiness: ${data.last_result.readiness_score}/100.`,
        "info",
      );
    } else if (data.last_result) {
      showToast(
        `Live scan complete — ingested ${data.last_result.live_ingested} real tool(s). Readiness: ${data.last_result.readiness_score}/100.`,
        "success",
      );
    }
  }

  function pollScanProgress() {
    const check = async () => {
      let data;
      try {
        data = await api.getScanProgress();
      } catch {
        pollTimer.current = setTimeout(check, 5000);
        return;
      }
      if (data.running) {
        setScanProgress(data);
        // Real per-tool progress ticks fast enough (each tool is a single
        // DB write, or one LLM call in REAL mode) that a 4s poll would lag
        // visibly behind — 1.2s keeps the bar/counter feeling live without
        // hammering the endpoint.
        pollTimer.current = setTimeout(check, 1200);
        return;
      }
      setScanning(false);
      setScanProgress(null);
      notifyScanResult(data);
      reload();
    };
    check();
  }

  async function runLiveScan() {
    setScanning(true);
    setScanProgress({ running: true, phase: "starting", current: 0, total: 0 });
    try {
      await api.startLiveScan();
      showToast(
        "Live scan started — this can take a few minutes for a large tool count. You can keep using the dashboard meanwhile.",
        "info",
      );
      pollScanProgress();
    } catch (e) {
      const message = e instanceof ApiError ? e.message : String(e);
      showToast(`Live scan failed: ${message}`, "error");
      setScanning(false);
      setScanProgress(null);
    }
  }

  async function cancelScan() {
    // Optimistic: flips the button to "Stopping…" immediately rather than
    // waiting for the next 1.2s poll to reflect cancel_requested, since
    // the backend only notices between tools and may not respond to this
    // call for a moment (a real Claude call or Celery task already in
    // flight keeps running until it finishes).
    setScanProgress((prev) => (prev ? { ...prev, cancel_requested: true } : prev));
    try {
      await api.cancelScan();
    } catch (e) {
      const message = e instanceof ApiError ? e.message : String(e);
      showToast(`Could not stop the scan: ${message}`, "error");
      setScanProgress((prev) => (prev ? { ...prev, cancel_requested: false } : prev));
    }
  }

  async function downloadCsv() {
    try {
      await api.downloadCsv(currentTenant || undefined);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : String(e);
      showToast(`CSV download failed: ${message}`, "error");
    }
  }

  async function downloadEvidenceReport() {
    try {
      await api.downloadEvidenceReport(currentTenant || undefined);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : String(e);
      showToast(`Evidence report download failed: ${message}`, "error");
    }
  }

  const riskCounts = counts(tools);

  // Clicking a KPI card opens the rich alerts-style preview (RiskAlertsModal)
  // rather than jumping straight to the table below — it also quietly sets
  // riskFilter so the table already reflects the chosen tier by the time
  // the user gets there via "View in table".
  function openRiskAlerts(filter: KpiFilter) {
    setRiskFilter(filter);
    setAlertsModalFilter(filter);
  }

  function jumpToTable() {
    setAlertsModalFilter(null);
    // The table is well below the fold at this point in the page (past the
    // trend chart, ROI calculator, access graph) — scroll to it so the
    // modal's "View in table" button actually lands on the filtered
    // result, not just changes state off-screen.
    toolsTableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div>
      <DashboardTopBar
        status={status}
        statusError={statusError}
        scanning={scanning}
        cancelRequested={scanProgress?.cancel_requested ?? false}
        canRunScan={isAdmin}
        onRunScan={runLiveScan}
        onCancelScan={cancelScan}
        onDownloadCsv={downloadCsv}
        onDownloadReport={downloadEvidenceReport}
      />

      {scanning && <ScanProgressBanner progress={scanProgress} />}

      <TenantBar profiles={tenantProfiles} currentTenant={currentTenant} onChange={setCurrentTenant} />

      <SectionTitle>DPDP Readiness Score</SectionTitle>
      <ReadinessGauge tools={tools} />

      <SectionTitle>
        Readiness Trend{" "}
        <span className="font-normal normal-case tracking-normal">(one point per scan — manual or scheduled)</span>
      </SectionTitle>
      <TrendChart history={history} />

      <SectionTitle>
        Scan History{" "}
        <span className="font-normal normal-case tracking-normal">(click a row for details)</span>
      </SectionTitle>
      <ScanHistoryTable history={history} />

      <SectionTitle>Risk Summary</SectionTitle>
      <KpiRow
        total={tools.length}
        high={riskCounts.High}
        med={riskCounts.Medium}
        low={riskCounts.Low}
        activeFilter={riskFilter}
        onFilterChange={openRiskAlerts}
      />

      {alertsModalFilter && (
        <RiskAlertsModal
          tools={tools}
          filter={alertsModalFilter}
          onClose={() => setAlertsModalFilter(null)}
          onViewInTable={jumpToTable}
        />
      )}

      <SectionTitle>Risk Breakdown</SectionTitle>
      <div className="grid grid-cols-[260px_1fr] gap-4">
        <DonutChart counts={riskCounts} />
        <DeptChart tools={tools} />
      </div>

      <SectionTitle>ROI &amp; Exposure Calculator</SectionTitle>
      <RoiCalculator highRiskCount={riskCounts.High} />

      <SectionTitle>
        License &amp; Seat Waste{" "}
        <span className="font-normal normal-case tracking-normal">(dormant tools still consuming a seat)</span>
      </SectionTitle>
      <LicenseWastePanel tools={tools} />

      <SectionTitle>Access Graph — Data Categories &rarr; Risk Level</SectionTitle>
      <AccessGraph tools={tools} />

      <SectionTitle>Graph Insights — Real Computed Metrics</SectionTitle>
      <GraphInsightsPanel data={graphInsights} loading={graphInsightsLoading} />

      <SectionTitle>Attack Paths — Structural Reachability</SectionTitle>
      <AttackPathPanel data={attackPaths} loading={attackPathsLoading} />

      <div ref={toolsTableRef}>
        <SectionTitle>Discovered Tools</SectionTitle>
        <ToolsTable
          tools={tools}
          onReload={reload}
          riskFilter={riskFilter}
          onClearRiskFilter={() => setRiskFilter("all")}
        />
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 mt-7 text-[13px] font-bold uppercase tracking-wide text-muted first:mt-0">
      {children}
    </div>
  );
}
