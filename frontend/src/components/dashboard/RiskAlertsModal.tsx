import { ArrowDownToLine, ShieldAlert, X } from "lucide-react";
import type { SaaSTool } from "../../types";
import { riskLevel } from "../../lib/risk";
import { RiskBadge } from "../Badge";
import { Modal } from "../Modal";
import type { KpiFilter } from "./KpiRow";

const TITLES: Record<KpiFilter, string> = {
  all: "All Discovered Tools",
  High: "All High-Risk Tools",
  Medium: "All Medium-Risk Tools",
  Low: "All Low-Risk Tools",
};

const ACCENT_TEXT: Record<KpiFilter, string> = {
  all: "text-accent",
  High: "text-high",
  Medium: "text-med",
  Low: "text-low",
};

const ACCENT_BG: Record<KpiFilter, string> = {
  all: "bg-accent-light",
  High: "bg-high-bg",
  Medium: "bg-med-bg",
  Low: "bg-low-bg",
};

// Opens from a Risk Summary KPI card (KpiRow.tsx) — a quick, richly laid
// out preview of that risk tier's tools, rather than just jumping straight
// to the full table below. "View in table" hands off to that table (with
// search/sort/remediate) for anything beyond a quick look.
export function RiskAlertsModal({
  tools,
  filter,
  onClose,
  onViewInTable,
}: {
  tools: SaaSTool[];
  filter: KpiFilter;
  onClose: () => void;
  onViewInTable: () => void;
}) {
  const rows = tools
    .filter((t) => filter === "all" || riskLevel(t.risk_score) === filter)
    .slice()
    .sort((a, b) => (b.risk_score ?? -1) - (a.risk_score ?? -1));

  return (
    <Modal onClose={onClose} maxWidth={680}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-5">
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${ACCENT_BG[filter]} ${ACCENT_TEXT[filter]}`}>
            <ShieldAlert size={18} strokeWidth={2.25} />
          </div>
          <div>
            <div className={`text-[16px] font-bold ${ACCENT_TEXT[filter]}`}>{TITLES[filter]}</div>
            <div className="text-[12px] text-muted">
              {rows.length} tool{rows.length === 1 ? "" : "s"} &middot; sorted by risk score, highest first
            </div>
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

      <div className="flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="p-10 text-center text-[13px] text-muted">
            No {filter === "all" ? "" : `${filter.toLowerCase()}-risk `}tools in this view.
          </div>
        ) : (
          rows.map((t) => {
            const level = riskLevel(t.risk_score);
            return (
              <div
                key={t.id}
                className="flex items-start justify-between gap-4 border-b border-border px-6 py-4 transition-colors last:border-0 hover:bg-tint/[0.025]"
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    {level ? <RiskBadge level={level} /> : <span className="text-[11px] font-semibold text-faint">Unassessed</span>}
                    <span className="truncate text-[14px] font-bold text-text">{t.tool_name}</span>
                  </div>
                  <div className="mb-1.5 text-[12px] text-muted">
                    {t.department} &middot; {t.source}
                    {t.vendor ? ` · ${t.vendor}` : ""}
                  </div>
                  <div
                    className="text-[12.5px] leading-relaxed text-muted"
                    style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2, overflow: "hidden" }}
                  >
                    {t.risk_reasoning ||
                      (t.risk_flags && t.risk_flags.length > 0 ? t.risk_flags.join(", ") : "Not yet assessed.")}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={`font-mono text-[20px] font-bold tabular-nums ${level ? ACCENT_TEXT[level] : "text-faint"}`}>
                    {t.risk_score ?? "—"}
                  </div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-faint">risk score</div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border bg-tint/[0.015] px-6 py-4">
        <div className="text-[12px] text-muted">Full table below has search, sorting, and remediation actions.</div>
        <button
          onClick={onViewInTable}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-gradient-to-b from-accent to-accent-dark px-4 py-2 text-[12.5px] font-semibold text-[#03151a] transition-all duration-150 hover:-translate-y-0.5 hover:shadow-accent-glow active:translate-y-0"
        >
          <ArrowDownToLine size={14} strokeWidth={2.25} /> View in table
        </button>
      </div>
    </Modal>
  );
}
