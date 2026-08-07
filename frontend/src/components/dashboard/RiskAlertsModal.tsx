import { ArrowRight, ShieldAlert, X } from "lucide-react";
import type { RiskLevel, SaaSTool } from "../../types";
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

// The left accent bar + score chip both key off the tier's solid/tint
// pair — same two-tone pattern KpiRow.tsx uses for its cards, reused here
// so a row reads as "the same risk tier" at a glance rather than
// introducing a new visual language just for this modal.
const BAR_CLASS: Record<RiskLevel, string> = { High: "bg-high", Medium: "bg-med", Low: "bg-low" };
const CHIP_CLASS: Record<RiskLevel, string> = {
  High: "bg-high-bg text-high-dark",
  Medium: "bg-med-bg text-med-dark",
  Low: "bg-low-bg text-low-dark",
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
    <Modal onClose={onClose} maxWidth={700}>
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

      <div className="flex-1 overflow-y-auto bg-tint/[0.01] p-4">
        {rows.length === 0 ? (
          <div className="p-10 text-center text-[13px] text-muted">
            No {filter === "all" ? "" : `${filter.toLowerCase()}-risk `}tools in this view.
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {rows.map((t) => {
              const level = riskLevel(t.risk_score);
              return (
                <div
                  key={t.id}
                  className="glass glass-hover relative overflow-hidden rounded-xl py-3.5 pl-5 pr-4"
                >
                  <div className={`absolute inset-y-0 left-0 w-[3px] ${level ? BAR_CLASS[level] : "bg-faint/40"}`} />
                  <div className="flex items-start justify-between gap-4">
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
                    <div
                      className={`flex shrink-0 flex-col items-center justify-center rounded-lg px-3.5 py-2 ${level ? CHIP_CLASS[level] : "bg-tint/[0.06] text-muted"}`}
                    >
                      <div className="font-mono text-[19px] font-bold tabular-nums leading-none">{t.risk_score ?? "—"}</div>
                      <div className="mt-1 text-[9px] font-semibold uppercase tracking-wide opacity-75">score</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border bg-tint/[0.015] px-6 py-4">
        <div className="text-[12px] text-muted">Full table below has search, sorting, and remediation actions.</div>
        <button
          onClick={onViewInTable}
          title="Scroll to the Discovered Tools table below, filtered to this view"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-gradient-to-b from-accent to-accent-dark px-4 py-2 text-[12.5px] font-semibold text-[#03151a] transition-all duration-150 hover:-translate-y-0.5 hover:shadow-accent-glow active:translate-y-0"
        >
          View in table <ArrowRight size={14} strokeWidth={2.25} />
        </button>
      </div>
    </Modal>
  );
}
