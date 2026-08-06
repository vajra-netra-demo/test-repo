import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../api/client";
import type { DiscoveryStatus, ReadinessHistoryPoint, RiskLevel, SaaSTool, TenantProfile } from "../../types";
import { riskLevel } from "../../lib/risk";
import { useToast } from "../Toaster";
import { DashboardTopBar } from "../dashboard/DashboardTopBar";
import { TenantBar } from "../dashboard/TenantBar";
import { ReadinessGauge } from "../dashboard/ReadinessGauge";
import { TrendChart } from "../dashboard/TrendChart";
import { KpiRow } from "../dashboard/KpiRow";
import { DonutChart } from "../dashboard/DonutChart";
import { DeptChart } from "../dashboard/DeptChart";
import { RoiCalculator } from "../dashboard/RoiCalculator";
import { AccessGraph } from "../dashboard/AccessGraph";
import { ToolsTable } from "../dashboard/ToolsTable";

function counts(tools: SaaSTool[]): Record<RiskLevel, number> {
  return {
    High: tools.filter((t) => riskLevel(t.risk_score) === "High").length,
    Medium: tools.filter((t) => riskLevel(t.risk_score) === "Medium").length,
    Low: tools.filter((t) => riskLevel(t.risk_score) === "Low").length,
  };
}

export function DashboardView() {
  const { showToast } = useToast();

  const [status, setStatus] = useState<DiscoveryStatus | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [scanning, setScanning] = useState(false);

  const [tenantProfiles, setTenantProfiles] = useState<TenantProfile[]>([]);
  const [currentTenant, setCurrentTenant] = useState("");

  const [tools, setTools] = useState<SaaSTool[]>([]);
  const [history, setHistory] = useState<ReadinessHistoryPoint[]>([]);

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

  const reload = useCallback(async () => {
    await Promise.all([loadTools(currentTenant), loadHistory()]);
  }, [currentTenant, loadTools, loadHistory]);

  useEffect(() => {
    loadStatus();
    api.getTenants().then(setTenantProfiles).catch(() => {});
  }, [loadStatus]);

  useEffect(() => {
    loadTools(currentTenant);
  }, [currentTenant, loadTools]);

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

  const riskCounts = counts(tools);

  return (
    <div>
      <DashboardTopBar
        status={status}
        statusError={statusError}
        scanning={scanning}
        onRunScan={runLiveScan}
        onDownloadCsv={() => window.location.assign(api.csvExportUrl(currentTenant || undefined))}
        onDownloadReport={() => window.location.assign(api.evidenceReportUrl(currentTenant || undefined))}
      />

      <TenantBar profiles={tenantProfiles} currentTenant={currentTenant} onChange={setCurrentTenant} />

      <SectionTitle>DPDP Readiness Score</SectionTitle>
      <ReadinessGauge tools={tools} />

      <SectionTitle>
        Readiness Trend{" "}
        <span className="font-normal normal-case tracking-normal">(one point per scan — manual or scheduled)</span>
      </SectionTitle>
      <TrendChart history={history} />

      <SectionTitle>Risk Summary</SectionTitle>
      <KpiRow total={tools.length} high={riskCounts.High} med={riskCounts.Medium} low={riskCounts.Low} />

      <SectionTitle>Risk Breakdown</SectionTitle>
      <div className="grid grid-cols-[260px_1fr] gap-4">
        <DonutChart counts={riskCounts} />
        <DeptChart tools={tools} />
      </div>

      <SectionTitle>ROI &amp; Exposure Calculator</SectionTitle>
      <RoiCalculator highRiskCount={riskCounts.High} />

      <SectionTitle>Access Graph — Data Categories &rarr; Risk Level</SectionTitle>
      <AccessGraph tools={tools} />

      <SectionTitle>Discovered Tools</SectionTitle>
      <ToolsTable tools={tools} onReload={reload} />
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
