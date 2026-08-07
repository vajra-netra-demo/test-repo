import { useEffect, useMemo, useState } from "react";
import type { SaaSTool } from "../../types";
import { chartInk, riskColors, RISK_GLOW } from "../../lib/risk";
import { useTheme } from "../../theme/ThemeProvider";

// Direct port of renderReadinessGauge() — 100 minus the average *effective*
// risk score across assessed tools, where a remediated tool contributes 0.
// The arc has a subtle gradient fill and sweeps in + counts up once on
// mount (replays whenever you navigate back to the Dashboard, since
// App.tsx mounts each view fresh) — kept deliberately understated after an
// earlier version's spinning dashed halo + orbiting highlight read as
// distracting rather than professional.
export function ReadinessGauge({ tools }: { tools: SaaSTool[] }) {
  const { theme } = useTheme();
  const colors = riskColors(theme);
  const ink = chartInk(theme);
  const assessed = useMemo(
    () => tools.filter((t) => t.risk_score !== null && t.risk_score !== undefined),
    [tools],
  );

  const totalEffectiveRisk = assessed.reduce((sum, t) => sum + (t.remediated ? 0 : (t.risk_score ?? 0)), 0);
  const avgRisk = assessed.length ? totalEffectiveRisk / assessed.length : 0;
  const score = assessed.length ? Math.round(100 - avgRisk) : 0;
  const tier = score >= 80 ? "Low" : score >= 50 ? "Medium" : "High";
  const color = colors[tier];

  const r = 45,
    cx = 55,
    cy = 55;
  const circumference = 2 * Math.PI * r;

  // Sweeps the arc in from 0 and counts the number up in lockstep, driven
  // by one rAF loop (not a CSS transition on stroke-dashoffset, which is
  // fine for the arc alone but can't also drive the text number in sync).
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (assessed.length === 0) {
      setDisplay(0);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const duration = 900;
    function tick(now: number) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setDisplay(Math.round(eased * score));
      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score, assessed.length]);

  if (assessed.length === 0) {
    return (
      <div className="glass glass-hover flex items-center gap-7 rounded-xl p-5.5 px-6.5">
        <svg width={110} height={110} viewBox="0 0 110 110">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={ink.track} strokeWidth={14} />
        </svg>
        <ReadinessText label="No assessed tools yet" />
      </div>
    );
  }

  const dash = (display / 100) * circumference;
  const remediatedCount = assessed.filter((t) => t.remediated).length;
  const label =
    remediatedCount > 0
      ? `Score ${score}/100 — ${remediatedCount} finding(s) remediated`
      : `Score ${score}/100 across ${assessed.length} assessed tools`;

  const gradId = `gauge-grad-${tier}`;

  return (
    <div className="glass glass-hover flex items-center gap-7 rounded-xl p-5.5 px-6.5">
      <svg width={110} height={110} viewBox="0 0 110 110" className="shrink-0">
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity={0.55} />
            <stop offset="100%" stopColor={color} stopOpacity={1} />
          </linearGradient>
        </defs>

        <circle cx={cx} cy={cy} r={r} fill="none" stroke={ink.track} strokeWidth={14} />

        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={14}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          transform={`rotate(-90 ${cx} ${cy})`}
          className={RISK_GLOW[tier]}
        />

        <text x={cx} y={cy - 3} textAnchor="middle" fontSize={23} fontWeight={700} fill={ink.ink} className="font-mono">
          {display}
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
