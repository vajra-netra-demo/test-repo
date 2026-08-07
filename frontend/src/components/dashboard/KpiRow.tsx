import type { RiskLevel } from "../../types";

export type KpiFilter = "all" | RiskLevel;

interface KpiRowProps {
  total: number;
  high: number;
  med: number;
  low: number;
  activeFilter: KpiFilter;
  onFilterChange: (filter: KpiFilter) => void;
}

export function KpiRow({ total, high, med, low, activeFilter, onFilterChange }: KpiRowProps) {
  // Clicking the already-active card clears the filter (toggle), rather
  // than requiring a separate "clear" control — matches how the ToolsTable
  // tabs below behave for source filtering.
  function toggle(filter: KpiFilter) {
    onFilterChange(activeFilter === filter ? "all" : filter);
  }

  return (
    <div className="grid grid-cols-4 gap-3.5">
      <KpiCard
        num={total}
        label="Total tools discovered"
        barClass="bg-accent"
        glowClass="glow-accent"
        ringClass="ring-accent/40"
        active={activeFilter === "all"}
        onClick={() => onFilterChange("all")}
      />
      <KpiCard
        num={high}
        label="High risk"
        barClass="bg-high"
        numClass="text-high"
        glowClass="glow-high"
        ringClass="ring-high/40"
        active={activeFilter === "High"}
        onClick={() => toggle("High")}
      />
      <KpiCard
        num={med}
        label="Medium risk"
        barClass="bg-med"
        numClass="text-med"
        glowClass="glow-med"
        ringClass="ring-med/40"
        active={activeFilter === "Medium"}
        onClick={() => toggle("Medium")}
      />
      <KpiCard
        num={low}
        label="Low risk"
        barClass="bg-low"
        numClass="text-low"
        glowClass="glow-low"
        ringClass="ring-low/40"
        active={activeFilter === "Low"}
        onClick={() => toggle("Low")}
      />
    </div>
  );
}

function KpiCard({
  num,
  label,
  barClass,
  numClass,
  glowClass,
  ringClass,
  active,
  onClick,
}: {
  num: number | string;
  label: string;
  barClass: string;
  numClass?: string;
  glowClass: string;
  ringClass: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Click to preview these tools"
      className={`glass glass-hover relative overflow-hidden rounded-xl p-4.5 px-5 text-left transition-all duration-200 hover:-translate-y-0.5 ${
        active ? `ring-2 ${ringClass}` : ""
      }`}
    >
      <div className={`absolute inset-y-0 left-0 w-[3px] ${barClass} ${glowClass}`} />
      <div className={`font-mono text-[30px] font-semibold leading-none tabular-nums ${numClass ?? "text-text"}`}>
        {num}
      </div>
      <div className="mt-1.5 text-[12px] font-semibold text-muted">{label}</div>
    </button>
  );
}
