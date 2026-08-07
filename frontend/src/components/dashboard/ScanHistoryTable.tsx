import { useState } from "react";
import type { ReadinessHistoryPoint } from "../../types";
import { Pagination } from "../Pagination";
import { usePagination } from "../../hooks/usePagination";
import { ScanDetailsModal } from "./ScanDetailsModal";
import { formatDuration } from "../../lib/duration";
import { formatTimestamp } from "../../lib/datetime";

const TRIGGER_LABEL: Record<string, string> = {
  manual: "Manual",
  scheduled: "Scheduled",
};

// Same data TrendChart.tsx plots (GET /report/history, one row per
// completed scan+assess cycle) — a table view alongside the trend line,
// with timings and a per-scan drill-down modal on row click.
export function ScanHistoryTable({ history }: { history: ReadinessHistoryPoint[] }) {
  // Newest first for a history table — TrendChart needs oldest-first for
  // its left-to-right chronological plot, so this keeps its own reversed
  // copy rather than changing the shared `history` prop's order.
  const rows = [...history].reverse();
  const { page, setPage, pageSize, setPageSize, pageCount, paged, totalRows } = usePagination(rows);
  const [selected, setSelected] = useState<ReadinessHistoryPoint | null>(null);

  return (
    <>
      <div className="glass overflow-hidden rounded-xl">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {["Date & Time", "Triggered By", "Readiness", "Duration", "Total Tools", "High", "Medium", "Low"].map((h) => (
                <th
                  key={h}
                  className="border-b border-border bg-tint/[0.02] px-3.5 py-2.75 text-left text-[10.5px] font-bold uppercase tracking-wide text-muted"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-10 text-center text-muted">
                  No scans recorded yet — run a manual scan or wait for the scheduled re-scan.
                </td>
              </tr>
            ) : (
              paged.map((s, i) => (
                <tr
                  key={`${s.timestamp}-${i}`}
                  onClick={() => setSelected(s)}
                  title="Click to view scan details"
                  className="cursor-pointer transition-colors hover:bg-accent-light/60"
                >
                  <td className="border-b border-border px-3.5 py-2.75 text-[13px] text-text">
                    {formatTimestamp(s.timestamp)}
                  </td>
                  <td className="border-b border-border px-3.5 py-2.75 text-[13px]">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        s.triggered_by === "manual" ? "bg-accent-light text-accent" : "bg-tint/[0.08] text-muted"
                      }`}
                    >
                      {TRIGGER_LABEL[s.triggered_by] ?? s.triggered_by}
                    </span>
                  </td>
                  <td className="border-b border-border px-3.5 py-2.75 text-[13px] font-mono font-semibold text-text">
                    {s.readiness_score ?? "—"}
                  </td>
                  <td className="border-b border-border px-3.5 py-2.75 text-[13px] font-mono text-muted">
                    {s.duration_seconds !== null ? formatDuration(s.duration_seconds) : "—"}
                  </td>
                  <td className="border-b border-border px-3.5 py-2.75 text-[13px] text-text">{s.total_tools}</td>
                  <td className="border-b border-border px-3.5 py-2.75 text-[13px] font-mono text-high">{s.high_count}</td>
                  <td className="border-b border-border px-3.5 py-2.75 text-[13px] font-mono text-med">{s.medium_count}</td>
                  <td className="border-b border-border px-3.5 py-2.75 text-[13px] font-mono text-low">{s.low_count}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination
          page={page}
          pageCount={pageCount}
          pageSize={pageSize}
          totalRows={totalRows}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {selected && <ScanDetailsModal scan={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
