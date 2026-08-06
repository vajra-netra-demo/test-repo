interface KpiRowProps {
  total: number;
  high: number;
  med: number;
  low: number;
}

export function KpiRow({ total, high, med, low }: KpiRowProps) {
  return (
    <div className="grid grid-cols-4 gap-3.5">
      <KpiCard num={total} label="Total tools discovered" barClass="bg-accent" glowClass="glow-accent" />
      <KpiCard num={high} label="High risk" barClass="bg-high" numClass="text-high" glowClass="glow-high" />
      <KpiCard num={med} label="Medium risk" barClass="bg-med" numClass="text-med" glowClass="glow-med" />
      <KpiCard num={low} label="Low risk" barClass="bg-low" numClass="text-low" glowClass="glow-low" />
    </div>
  );
}

function KpiCard({
  num,
  label,
  barClass,
  numClass,
  glowClass,
}: {
  num: number | string;
  label: string;
  barClass: string;
  numClass?: string;
  glowClass: string;
}) {
  return (
    <div className="glass glass-hover relative overflow-hidden rounded-xl p-4.5 px-5 transition-all duration-200 hover:-translate-y-0.5">
      <div className={`absolute inset-y-0 left-0 w-[3px] ${barClass} ${glowClass}`} />
      <div className={`font-mono text-[30px] font-semibold leading-none tabular-nums ${numClass ?? "text-text"}`}>
        {num}
      </div>
      <div className="mt-1.5 text-[12px] font-semibold text-muted">{label}</div>
    </div>
  );
}
