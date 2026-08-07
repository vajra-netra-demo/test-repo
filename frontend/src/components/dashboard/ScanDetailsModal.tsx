import { X } from "lucide-react";
import type { ReadinessHistoryPoint } from "../../types";
import { Modal } from "../Modal";
import { DonutChart } from "./DonutChart";
import { formatDuration } from "../../lib/duration";
import { formatTimestamp } from "../../lib/datetime";

const TRIGGER_LABEL: Record<string, string> = {
  manual: "Manually triggered — Run Live Scan button",
  scheduled: "Automatic scheduled re-scan",
};

// Opens from a row in ScanHistoryTable.tsx. ScanSnapshot (backend/app/
// models.py) only ever stored aggregate counts for a completed cycle, not
// which specific tools were part of it — SaaSTool rows are reassessed in
// place on every cycle, not versioned per-scan — so "scan details" here is
// necessarily the full aggregate picture that snapshot captured (readiness
// score, tool count, risk breakdown), not a per-tool diff.
export function ScanDetailsModal({ scan, onClose }: { scan: ReadinessHistoryPoint; onClose: () => void }) {
  const counts = { High: scan.high_count, Medium: scan.medium_count, Low: scan.low_count };

  return (
    <Modal onClose={onClose} maxWidth={560}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-5">
        <div className="min-w-0">
          <div className="text-[16px] font-bold text-text">Scan Details</div>
          <div className="truncate text-[12px] text-muted">
            {formatTimestamp(scan.timestamp)} &middot; {TRIGGER_LABEL[scan.triggered_by] ?? scan.triggered_by}
          </div>
        </div>
        <button
          onClick={onClose}
          title="Close"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-tint/[0.08] hover:text-text"
        >
          <X size={17} strokeWidth={2.25} />
        </button>
      </div>

      <div className="p-6">
        <div className="mb-4 grid grid-cols-3 gap-3.5">
          <div className="glass rounded-lg p-3.5 px-4">
            <div className="font-mono text-[22px] font-semibold tabular-nums text-accent">
              {scan.readiness_score ?? "—"}
              <span className="text-[13px] text-muted"> / 100</span>
            </div>
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Readiness Score</div>
          </div>
          <div className="glass rounded-lg p-3.5 px-4">
            <div className="font-mono text-[22px] font-semibold tabular-nums text-text">{scan.total_tools}</div>
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Tools Assessed</div>
          </div>
          <div className="glass rounded-lg p-3.5 px-4">
            <div className="font-mono text-[22px] font-semibold tabular-nums text-text">
              {scan.duration_seconds !== null ? formatDuration(scan.duration_seconds) : "—"}
            </div>
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Duration</div>
          </div>
        </div>

        <DonutChart counts={counts} />
      </div>
    </Modal>
  );
}
