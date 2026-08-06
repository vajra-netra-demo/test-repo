import { useMemo } from "react";
import type { SaaSTool } from "../../types";
import { chartInk, riskColors, RISK_GLOW } from "../../lib/risk";
import { useTheme } from "../../theme/ThemeProvider";

// Direct port of renderReadinessGauge() — 100 minus the average *effective*
// risk score across assessed tools, where a remediated tool contributes 0.
export function ReadinessGauge({ tools }: { tools: SaaSTool[] }) {
  const { theme } = useTheme();
  const colors = riskColors(theme);
  const ink = chartInk(theme);
  const assessed = useMemo(
    () => tools.filter((t) => t.risk_score !== null && t.risk_score !== undefined),
    [tools],
  );

  if (assessed.length === 0) {
    return (
      <div className="glass glass-hover flex items-center gap-7 rounded-xl p-5.5 px-6.5">
        <svg width={110} height={110} viewBox="0 0 110 110">
          <circle cx={55} cy={55} r={45} fill="none" stroke={ink.track} strokeWidth={14} />
        </svg>
        <ReadinessText label="No assessed tools yet" />
      </div>
    );
  }

  const totalEffectiveRisk = assessed.reduce(
    (sum, t) => sum + (t.remediated ? 0 : (t.risk_score ?? 0)),
    0,
  );
  const avgRisk = totalEffectiveRisk / assessed.length;
  const score = Math.round(100 - avgRisk);
  const tier = score >= 80 ? "Low" : score >= 50 ? "Medium" : "High";
  const color = colors[tier];

  const r = 45,
    cx = 55,
    cy = 55;
  const circumference = 2 * Math.PI * r;
  const dash = (score / 100) * circumference;
  const remediatedCount = assessed.filter((t) => t.remediated).length;
  const label =
    remediatedCount > 0
      ? `Score ${score}/100 — ${remediatedCount} finding(s) remediated`
      : `Score ${score}/100 across ${assessed.length} assessed tools`;

  return (
    <div className="glass glass-hover flex items-center gap-7 rounded-xl p-5.5 px-6.5">
      <svg width={110} height={110} viewBox="0 0 110 110">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={ink.track} strokeWidth={14} />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={14}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeDashoffset={0}
          transform={`rotate(-90 ${cx} ${cy})`}
          className={RISK_GLOW[tier]}
        />
        <text
          x={cx}
          y={cy - 3}
          textAnchor="middle"
          fontSize={23}
          fontWeight={700}
          fill={ink.ink}
          className="font-mono"
        >
          {score}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize={9} fill={ink.muted} className="font-mono">
          / 100
        </text>
      </svg>
      <ReadinessText label={label} />
    </div>
  );
}

function ReadinessText({ label }: { label: string }) {
  return (
    <div>
      <h2 className="mb-1 text-[15px] font-semibold text-text">{label}</h2>
      <p className="max-w-[480px] text-[12.5px] leading-relaxed text-muted">
        100 minus the average risk score across all assessed tools. Marking a finding as{" "}
        <strong className="text-text">Remediated</strong> removes its penalty here — this score is
        meant to move as you act on findings, not just sit as a one-time snapshot.
      </p>
    </div>
  );
}
