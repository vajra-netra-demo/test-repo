import { useMemo, useState } from "react";

const ILLUSTRATIVE_RATE_PER_EMPLOYEE_PER_YEAR = 1200; // Rs. — placeholder pending real pricing
const AVG_BREACH_COST_CR = 25.5; // IBM Cost of a Data Breach Report 2026, India
const SHADOW_IT_PREMIUM_CR = 1.79; // IBM report: additional cost when shadow AI/IT contributed

// .toFixed(0) alone rounds anything under 0.5 down to a literal "0" — at a
// large enough employee count the illustrative subscription cost (which
// scales linearly with headcount) can exceed the breach exposure, so the
// ratio drops below 1 and the sentence read "...costs roughly 0x this
// org's subscription", which is nonsense, not just imprecise.
function formatRatio(ratio: number): string {
  if (ratio >= 10) return Math.round(ratio).toString();
  return ratio.toFixed(1);
}

export function RoiCalculator({ highRiskCount }: { highRiskCount: number }) {
  const [employeesInput, setEmployeesInput] = useState("500");

  const calc = useMemo(() => {
    const employees = Math.max(1, parseInt(employeesInput, 10) || 500);
    const subscriptionRs = employees * ILLUSTRATIVE_RATE_PER_EMPLOYEE_PER_YEAR;
    const subscriptionCr = subscriptionRs / 1e7;
    const subscriptionLabel =
      subscriptionCr >= 1 ? `₹${subscriptionCr.toFixed(2)} Cr` : `₹${(subscriptionRs / 1e5).toFixed(1)} L`;

    const exposureCr = AVG_BREACH_COST_CR + (highRiskCount > 0 ? SHADOW_IT_PREMIUM_CR : 0);
    const ratio = subscriptionCr > 0 ? exposureCr / subscriptionCr : 0;
    // Below ratio 1 the subscription itself costs more than the breach
    // (a real outcome at a high enough employee count, since the
    // illustrative subscription scales with headcount) — a multiplier
    // below 1 reads oddly ("costs roughly 0.4x"), so switch to a percentage
    // framing there instead of just formatting the same number smaller.
    const comparison =
      ratio >= 1
        ? `roughly ${formatRatio(ratio)}x this org's illustrative annual NETRA subscription`
        : `about ${Math.round(ratio * 100)}% of this org's illustrative annual NETRA subscription — smaller than the subscription itself at this employee count`;

    return { subscriptionLabel, exposureCr, comparison };
  }, [employeesInput, highRiskCount]);

  return (
    <div className="glass glass-hover rounded-xl p-5">
      <div className="mb-4.5 flex flex-wrap items-center gap-2.5">
        <label htmlFor="roiEmployees" className="text-[13px] font-semibold text-text">
          Organization size:
        </label>
        <input
          id="roiEmployees"
          type="number"
          min={1}
          step={1}
          value={employeesInput}
          onChange={(e) => setEmployeesInput(e.target.value)}
          className="w-[120px] rounded-lg border border-border bg-tint/[0.03] px-3 py-2 text-[13px] text-text transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
        <label className="text-[13px] font-semibold text-text">employees</label>
      </div>

      <div className="mb-3.5 grid grid-cols-4 gap-3.5">
        <RoiCard label="DPDP Statutory Ceiling" value="₹250 Cr" colorClass="text-high" />
        <RoiCard label="Avg. Breach Cost (India, 2026)" value="₹25.5 Cr" colorClass="text-med" />
        <RoiCard
          label="Shadow-IT/AI Breach Premium"
          value={highRiskCount > 0 ? `+₹${SHADOW_IT_PREMIUM_CR} Cr` : "N/A"}
          colorClass="text-med-dark"
          title={
            highRiskCount > 0
              ? `You currently have ${highRiskCount} high-risk unmonitored tool(s) discovered.`
              : "No high-risk tools currently discovered in this view."
          }
        />
        <RoiCard label="Illustrative NETRA Cost/Year" value={calc.subscriptionLabel} colorClass="text-accent" />
      </div>

      <div className="mb-2.5 rounded-xl border border-low/30 bg-low-bg p-3.5 px-4.5 text-[14px] font-semibold text-low-dark">
        {highRiskCount > 0
          ? `A single average breach with shadow-IT involvement (₹${calc.exposureCr.toFixed(2)} Cr) costs ${calc.comparison} — and this view currently shows ${highRiskCount} high-risk tool(s) that could be exactly that entry point.`
          : `A single average India data breach (₹${calc.exposureCr.toFixed(2)} Cr) costs ${calc.comparison}.`}
      </div>
      <div className="text-[10.5px] leading-relaxed text-muted">
        Sources: DPDP Act 2023, Section 8(5) (statutory maximum for security-safeguard failures) · IBM
        Cost of a Data Breach Report 2026, India findings (average breach cost, and the additional
        cost specifically when shadow AI/IT contributed to the breach). NETRA subscription cost is an
        illustrative placeholder pending real pricing input — not a final quote.
      </div>
    </div>
  );
}

function RoiCard({
  label,
  value,
  colorClass,
  title,
}: {
  label: string;
  value: string;
  colorClass: string;
  title?: string;
}) {
  return (
    <div
      className="glass rounded-lg p-3.5 px-4 transition-all duration-150 hover:-translate-y-0.5 hover:bg-card-hover"
      title={title}
    >
      <div className={`font-mono text-[22px] font-semibold tabular-nums ${colorClass}`}>{value}</div>
      <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
}
