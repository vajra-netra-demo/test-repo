import { Download, FileText, RefreshCw, Square } from "lucide-react";
import type { DiscoveryStatus } from "../../types";
import { StatusPill } from "../Badge";

interface DashboardTopBarProps {
  status: DiscoveryStatus | null;
  statusError: boolean;
  scanning: boolean;
  cancelRequested: boolean;
  canRunScan: boolean;
  onRunScan: () => void;
  onCancelScan: () => void;
  onDownloadCsv: () => void;
  onDownloadReport: () => void;
}

export function DashboardTopBar({
  status,
  statusError,
  scanning,
  cancelRequested,
  canRunScan,
  onRunScan,
  onCancelScan,
  onDownloadCsv,
  onDownloadReport,
}: DashboardTopBarProps) {
  return (
    <div className="mb-5">
      {/* Row 1: title + primary actions, grouped as one unit so a narrow
          viewport wraps this whole group together, never split. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-0.5 text-[21px] font-semibold text-text">Discovery Overview</h1>
          <p className="m-0 text-[13px] text-muted">
            SaaS tools, OAuth grants, and AI-tool connections discovered across the organization
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={onDownloadCsv}
            className="glass glass-hover inline-flex items-center gap-1.5 rounded-lg px-4 py-2.25 text-[13px] font-semibold text-text transition-all duration-150 hover:-translate-y-0.5"
          >
            <Download size={14} strokeWidth={2.25} /> CSV
          </button>
          <button
            onClick={onDownloadReport}
            className="glass glass-hover inline-flex items-center gap-1.5 rounded-lg px-4 py-2.25 text-[13px] font-semibold text-text transition-all duration-150 hover:-translate-y-0.5"
          >
            <FileText size={14} strokeWidth={2.25} /> Evidence Report
          </button>
          <button
            onClick={onRunScan}
            disabled={scanning || !canRunScan || (status ? !status.live_scan_configured : false)}
            title={canRunScan ? undefined : "Admin only"}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-accent to-accent-dark px-4 py-2.25 text-[13px] font-semibold text-[#03151a] transition-all duration-150 hover:-translate-y-0.5 hover:shadow-accent-glow active:translate-y-0 disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-tint/10 disabled:bg-none disabled:text-faint disabled:shadow-none"
          >
            <RefreshCw size={14} strokeWidth={2.5} className={scanning ? "animate-spin" : ""} />
            {scanning ? "Scanning…" : "Run Live Scan"}
          </button>
          {scanning && (
            <button
              onClick={onCancelScan}
              disabled={!canRunScan || cancelRequested}
              title={canRunScan ? "Stop the running scan — keeps whatever's already been assessed" : "Admin only"}
              className="inline-flex items-center gap-1.5 rounded-lg border border-high/30 bg-high-bg px-4 py-2.25 text-[13px] font-semibold text-high-dark transition-all duration-150 hover:-translate-y-0.5 hover:bg-high hover:text-white disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-high-bg disabled:hover:text-high-dark"
            >
              <Square size={12} strokeWidth={2.5} fill="currentColor" />
              {cancelRequested ? "Stopping…" : "Stop"}
            </button>
          )}
        </div>
      </div>

      {/* Row 2: config/health status — its own wrap group, deliberately
          separated from the buttons above. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {statusError ? (
          <StatusPill label="Could not reach API" />
        ) : !status ? (
          <StatusPill label="checking live scan status…" />
        ) : (
          <>
            <StatusPill
              label={
                status.live_scan_configured
                  ? `Live scan: configured (${status.provider})`
                  : "Live scan: not configured — see LIVE_SCAN_SETUP.md"
              }
              live={status.live_scan_configured}
            />
            <StatusPill
              label={
                status.scheduler?.enabled
                  ? (status.scheduler.run_count ?? 0) > 0
                    ? `Auto re-scan: every ${status.scheduler.interval_seconds}s (${status.scheduler.run_count} run${status.scheduler.run_count !== 1 ? "s" : ""}, last: ${status.scheduler.last_status})`
                    : `Auto re-scan: every ${status.scheduler.interval_seconds}s (no runs yet)`
                  : "Auto re-scan: disabled"
              }
              live={!!status.scheduler?.enabled}
            />
            <StatusPill
              label={status.sentinel_configured ? "Sentinel: connected" : "Sentinel: not configured"}
              live={status.sentinel_configured}
            />
          </>
        )}
      </div>
    </div>
  );
}
