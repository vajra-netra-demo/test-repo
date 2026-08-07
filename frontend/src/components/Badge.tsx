import type { RiskLevel } from "../types";

const RISK_CLASSES: Record<RiskLevel, string> = {
  High: "bg-high-bg text-high-dark ring-1 ring-inset ring-high/30",
  Medium: "bg-med-bg text-med-dark ring-1 ring-inset ring-med/30",
  Low: "bg-low-bg text-low-dark ring-1 ring-inset ring-low/30",
};

export function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <span
      className={`inline-block rounded-full px-[11px] py-[3px] text-[11.5px] font-bold tracking-wide transition-colors ${RISK_CLASSES[level]}`}
    >
      {level}
    </span>
  );
}

export function StatusPill({ label, live }: { label: string; live?: boolean }) {
  return (
    <span
      className={`glass inline-flex items-center gap-1.5 rounded-full px-[11px] py-[5px] text-[11px] font-semibold transition-colors ${
        live ? "text-low-dark ring-1 ring-inset ring-low/25" : "text-muted"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${live ? "bg-low animate-live-pulse glow-low" : "bg-faint"}`}
      />
      {label}
    </span>
  );
}
