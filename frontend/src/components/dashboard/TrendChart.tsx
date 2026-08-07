import { useMemo } from "react";
import type { ReadinessHistoryPoint } from "../../types";
import { chartInk, riskColors } from "../../lib/risk";
import { useTheme } from "../../theme/ThemeProvider";

// Direct port of loadTrend()/renderTrend — one point per completed scan.
export function TrendChart({ history }: { history: ReadinessHistoryPoint[] }) {
  const { theme } = useTheme();
  const colors = riskColors(theme);
  const ink = chartInk(theme);
  const points = useMemo(() => history.filter((h) => h.readiness_score !== null), [history]);

  if (points.length < 2) {
    return (
      <div className="glass glass-hover rounded-xl p-5">
        <div className="py-10 text-center text-muted">
          Only one scan so far — trend will appear after the next scan runs.
        </div>
      </div>
    );
  }

  const w = 640,
    h = 140,
    padX = 30,
    padY = 20;
  const xStep = (w - 2 * padX) / (points.length - 1);
  const yFor = (score: number) => padY + (1 - score / 100) * (h - 2 * padY);
  const xFor = (i: number) => padX + i * xStep;

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${xFor(i)},${yFor(p.readiness_score ?? 0)}`)
    .join(" ");

  return (
    <div className="glass glass-hover rounded-xl p-5">
      <svg width="100%" height={140} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
        <line x1={padX} y1={yFor(80)} x2={w - padX} y2={yFor(80)} stroke={ink.track} strokeDasharray="3,3" />
        <line x1={padX} y1={yFor(50)} x2={w - padX} y2={yFor(50)} stroke={ink.track} strokeDasharray="3,3" />
        <path d={pathD} fill="none" stroke={ink.accent} strokeWidth={2} className="glow-accent" />
        {points.map((p, i) => {
          const score = p.readiness_score ?? 0;
          const color = score >= 80 ? colors.Low : score >= 50 ? colors.Medium : colors.High;
          return (
            <circle
              key={i}
              cx={xFor(i)}
              cy={yFor(score)}
              r={4}
              fill={color}
              stroke={ink.ring}
              strokeWidth={2}
              className="cursor-pointer"
            >
              <title>
                {p.timestamp} ({p.triggered_by}): {score}/100
              </title>
            </circle>
          );
        })}
      </svg>
    </div>
  );
}
