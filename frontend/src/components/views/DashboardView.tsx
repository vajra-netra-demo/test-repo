import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import type { DiscoveryStatus, ReadinessHistoryPoint, RiskLevel, SaaSTool, TenantProfile } from "../../types";
import { riskLevel } from "../../lib/risk";
import { useToast } from "../Toaster";
import { DashboardTopBar } from "../dashboard/DashboardTopBar";
import { ScanProgressBanner } from "../dashboard/ScanProgressBanner";
import { TenantBar } from "../dashboard/TenantBar";
import { ReadinessGauge } from "../dashboard/ReadinessGauge";
import { TrendChart } from "../dashboard/TrendChart";
import { KpiRow, type KpiFilter } from "../dashboard/KpiRow";
import { DonutChart } from "../dashboard/DonutChart";
import { DeptChart } from "../dashboard/DeptChart";
import { RoiCalculator } from "../dashboard/RoiCalculator";
import { AccessGraph } from "../dashboard/AccessGraph";
import { GraphInsightsPanel } from "../dashboard/GraphInsightsPanel";
import { RiskAlertsModal } from "../dashboard/RiskAlertsModal";
import { ToolsTable } from "../dashboard/ToolsTable";
import type { GraphInsights } from "../../types";

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

  const [tenantProfiles, setTenantProfiles] = useState<TenantProfile[]>([]);
  const [currentTenant, setCurrentTenant] = useState("");

  const [tools, setTools] = useState<SaaSTool[]>([]);
  const [history, setHistory] = useState<ReadinessHistoryPoint[]>([]);
  const [graphInsights, setGraphInsights] = useState<GraphInsights | null>(null);
  const [graphInsightsLoading, setGraphInsightsLoading] = useState(true);
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

  const reload = useCallback(async () => {
    await Promise.all([loadTools(currentTenant), loadHistory(), loadGraphInsights(currentTenant)]);
  }, [currentTenant, loadTools, loadHistory, loadGraphInsights]);

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
          pollScanProgress();
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadStatus]);

  useEffect(() => {
    loadTools(currentTenant);
    loadGraphInsights(currentTenant);
  }, [currentTenant, loadTools, loadGraphInsights]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => () => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
  }, []);

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
        pollTimer.current = setTimeout(check, 4000);
        return;
      }
      setScanning(false);
      if (data.last_error) {
        showToast(`Live scan failed: ${data.last_error}`, "error");
      } else if (data.last_result) {
        showToast(
          `Live scan complete — ingested ${data.last_result.live_ingested} real tool(s). Readiness: ${data.last_result.readiness_score}/100.`,
          "success",
        );
      }
      reload();
    };
    check();
  }

  async function runLiveScan() {
    setScanning(true);
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
        canRunScan={isAdmin}
        onRunScan={runLiveScan}
        onDownloadCsv={downloadCsv}
        onDownloadReport={downloadEvidenceReport}
      />

      {scanning && <ScanProgressBanner />}

      <TenantBar profiles={tenantProfiles} currentTenant={currentTenant} onChange={setCurrentTenant} />

      <SectionTitle>DPDP Readiness Score</SectionTitle>
      <ReadinessGauge tools={tools} />

      <SectionTitle>
        Readiness Trend{" "}
        <span className="font-normal normal-case tracking-normal">(one point per scan — manual or scheduled)</span>
      </SectionTitle>
      <TrendChart history={history} />

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

      <SectionTitle>Access Graph — Data Categories &rarr; Risk Level</SectionTitle>
      <AccessGraph tools={tools} />

      <SectionTitle>Graph Insights — Real Computed Metrics</SectionTitle>
      <GraphInsightsPanel data={graphInsights} loading={graphInsightsLoading} />

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
