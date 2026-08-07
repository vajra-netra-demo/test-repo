import { useMemo } from "react";
import type { SaaSTool } from "../../types";

// Real signal, illustrative cost: "dormant" here means monthly_active_users
// <= 1 on a tool nobody's remediated yet — the same usage field the risk
// engine already uses for its own dormant-access flag (see
// BROAD_SCOPE_MARKERS/dormant checks in risk_engine.py), just aggregated
// into a spend-facing view instead of a risk-facing one. There is no real
// per-tool license cost anywhere in this data model (no pricing input
// exists), so the Rs. figure below is explicitly an illustrative industry
// placeholder, same honesty bar as RoiCalculator.tsx's own subscription
// estimate — a real deployment would replace this with the org's actual
// per-seat contract costs.
const ILLUSTRATIVE_MONTHLY_COST_PER_SEAT = 1500; // Rs. — placeholder pending real license cost input
const DORMANT_MAU_THRESHOLD = 1;

function formatRs(rs: number): string {
  const cr = rs / 1e7;
  if (cr >= 1) return `₹${cr.toFixed(2)} Cr`;
  const lakh = rs / 1e5;
  if (lakh >= 1) return `₹${lakh.toFixed(1)} L`;
  return `₹${rs.toLocaleString("en-IN")}`;
}

export function LicenseWastePanel({ tools }: { tools: SaaSTool[] }) {
  const stats = useMemo(() => {
    const dormant = tools.filter(
      (t) => !t.remediated && (t.monthly_active_users ?? 0) <= DORMANT_MAU_THRESHOLD,
    );

    const byDept = new Map<string, number>();
    for (const t of dormant) {
      byDept.set(t.department, (byDept.get(t.department) ?? 0) + 1);
    }
    const deptRows = [...byDept.entries()].sort((a, b) => b[1] - a[1]);

    const monthlyWaste = dormant.length * ILLUSTRATIVE_MONTHLY_COST_PER_SEAT;
    const annualWaste = monthlyWaste * 12;

    const topTools = [...dormant]
      .sort((a, b) => (a.monthly_active_users ?? 0) - (b.monthly_active_users ?? 0))
      .slice(0, 8);

    return { dormant, deptRows, monthlyWaste, annualWaste, topTools };
  }, [tools]);

  return (
    <div className="glass glass-hover rounded-xl p-5">
      <div className="mb-4.5 grid grid-cols-3 gap-3.5">
        <WasteCard label="Dormant / Idle Seats" value={stats.dormant.length.toString()} colorClass="text-med" />
        <WasteCard label="Illustrative Waste / Month" value={formatRs(stats.monthlyWaste)} colorClass="text-med-dark" />
        <WasteCard label="Illustrative Waste / Year" value={formatRs(stats.annualWaste)} colorClass="text-high" />
      </div>

      {stats.dormant.length === 0 ? (
        <div className="p-6 text-center text-[13px] text-muted">
          No dormant tools (monthly_active_users &le; {DORMANT_MAU_THRESHOLD}) in this view — nothing to flag for
          license review right now.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">By department</div>
            <div className="flex flex-col gap-1.5">
              {stats.deptRows.map(([dept, count]) => (
                <div key={dept} className="flex items-center justify-between text-[13px]">
                  <span className="truncate text-text" title={dept}>
                    {dept}
                  </span>
                  <span className="font-mono font-semibold text-med-dark">{count}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
              Lowest-usage tools
            </div>
            <div className="flex flex-col gap-1.5">
              {stats.topTools.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="truncate text-text" title={t.tool_name}>
                    {t.tool_name}
                  </span>
                  <span className="shrink-0 font-mono text-muted">{t.monthly_active_users ?? 0} MAU</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 border-t border-border pt-3 text-[10.5px] leading-relaxed text-muted">
        "Dormant" = {DORMANT_MAU_THRESHOLD} or fewer monthly active users and not yet marked Remediated — the same
        usage signal the risk engine already flags as dormant-access, aggregated here as a spend view. The
        Rs. {ILLUSTRATIVE_MONTHLY_COST_PER_SEAT.toLocaleString("en-IN")}/seat/month figure is an illustrative
        industry placeholder, not this org's actual license cost — a real deployment would use real per-seat
        contract pricing.
      </div>
    </div>
  );
}

function WasteCard({ label, value, colorClass }: { label: string; value: string; colorClass: string }) {
  return (
    <div className="glass rounded-lg p-3.5 px-4 transition-all duration-150 hover:-translate-y-0.5 hover:bg-card-hover">
      <div className={`font-mono text-[22px] font-semibold tabular-nums ${colorClass}`}>{value}</div>
      <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
}
