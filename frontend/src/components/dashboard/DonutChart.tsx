import type { RiskLevel } from "../../types";
import { chartInk, riskColors } from "../../lib/risk";
import { useTheme } from "../../theme/ThemeProvider";

const LEVELS: RiskLevel[] = ["High", "Medium", "Low"];

export function DonutChart({ counts }: { counts: Record<RiskLevel, number> }) {
  const { theme } = useTheme();
  const colors = riskColors(theme);
  const ink = chartInk(theme);
  const total = counts.High + counts.Medium + counts.Low;
  const r = 45,
    cx = 55,
    cy = 55;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="glass glass-hover rounded-xl p-5">
      <h3 className="mb-4 text-[13px] uppercase tracking-wide text-muted">By Risk Level</h3>
      <div className="flex items-center gap-5">
        <svg width={110} height={110} viewBox="0 0 110 110">
          {total === 0 ? (
            <circle cx={cx} cy={cy} r={r} fill="none" stroke={ink.track} strokeWidth={14} />
          ) : (
            LEVELS.map((level) => {
              const val = counts[level];
              if (val === 0) return null;
              const frac = val / total;
              const dash = frac * circumference;
              const el = (
                <circle
                  key={level}
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke={colors[level]}
                  strokeWidth={14}
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-offset}
                  transform={`rotate(-90 ${cx} ${cy})`}
                  className="transition-opacity hover:opacity-75"
                >
                  <title>
                    {level}: {val} tool{val !== 1 ? "s" : ""}
                  </title>
                </circle>
              );
              offset += dash;
              return el;
            })
          )}
          <text
            x={cx}
            y={cy - 3}
            textAnchor="middle"
            fontSize={20}
            fontWeight={700}
            fill={ink.ink}
            className="font-mono"
          >
            {total}
          </text>
          <text x={cx} y={cy + 13} textAnchor="middle" fontSize={9} fill={ink.muted}>
            tools
          </text>
        </svg>
        <div className="text-[12px]">
          {LEVELS.map((level) => (
            <div key={level} className="mb-2 flex items-center gap-2">
              <span
                className="inline-block h-2.25 w-2.25 rounded-full"
                style={{ background: colors[level] }}
              />
              <span className="text-muted">{level}</span>
              <span className="ml-auto pl-3 font-bold" style={{ color: colors[level] }}>
                {counts[level]}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
