import { useMemo } from "react";
import type { RiskChanges } from "../../types";
import { chartInk, riskColors } from "../../lib/risk";
import { useTheme } from "../../theme/ThemeProvider";

const TOP_LABEL_COUNT = 5;

// Renders GET /discovery/risk-changes as a slope chart — the standard form
// for "compare two values per entity across two points" (Tufte's
// before/after chart), rather than a plain list. previous_risk_score is
// captured right before every overwrite (scan_pipeline.py/tasks.py):
// one step back, not a full time-series, and the chart says so.
export function RiskChangesPanel({ data, loading }: { data: RiskChanges | null; loading: boolean }) {
  const { theme } = useTheme();
  const colors = riskColors(theme);
  const ink = chartInk(theme);

  const layout = useMemo(() => {
    if (!data || data.changes.length === 0) return null;

    const w = 640,
      h = 320,
      leftX = 150,
      rightX = 490,
      topY = 40,
      bottomY = 280;
    const yFor = (score: number) => topY + (1 - score / 100) * (bottomY - topY);

    // Data arrives sorted by |delta| descending (backend) — direct-label
    // only the top few lines (selective labeling), the rest stay
    // hover-only via <title> to avoid a wall of overlapping text.
    const rows = data.changes.map((c, i) => ({
      ...c,
      worse: c.delta > 0,
      y1: yFor(c.previous_risk_score),
      y2: yFor(c.risk_score),
      labeled: i < TOP_LABEL_COUNT,
    }));

    return { w, h, leftX, rightX, topY, bottomY, yFor, rows };
  }, [data]);

  if (loading || !data) {
    return (
      <div className="glass rounded-xl p-5 text-[13px] text-muted">
        {loading ? "Computing risk changes…" : "No scan data yet."}
      </div>
    );
  }

  return (
    <div className="glass glass-hover rounded-xl p-5">
      <p className="mb-4.5 text-[11px] font-semibold uppercase leading-relaxed tracking-wide text-muted">
        Each tool's risk score, before and after its last reassessment — a one-step-back comparison, not
        continuous monitoring across a full history.
      </p>

      {!layout ? (
        <div className="p-6 text-center text-[13px] text-muted">
          No tools have changed risk score since their previous reassessment yet — run another scan to
          build a comparison point.
        </div>
      ) : (
        <>
          <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
            <span>
              {data.total_changes_found} tool{data.total_changes_found !== 1 ? "s" : ""} changed
              {data.total_changes_found > data.changes.length ? ` (showing top ${data.changes.length})` : ""}
            </span>
            <div className="flex items-center gap-4 text-[11px]">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: colors.High }} />
                Got riskier
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: colors.Low }} />
                Got safer
              </span>
            </div>
          </div>

          <svg width="100%" height={layout.h} viewBox={`0 0 ${layout.w} ${layout.h}`} preserveAspectRatio="xMidYMid meet">
            {/* Low/Medium/High threshold gridlines — same boundaries as lib/risk.ts's riskLevel() */}
            {[30, 70].map((score) => (
              <g key={score}>
                <line
                  x1={layout.leftX - 10}
                  y1={layout.yFor(score)}
                  x2={layout.rightX + 10}
                  y2={layout.yFor(score)}
                  stroke={ink.track}
                  strokeDasharray="3,3"
                />
                <text x={layout.leftX - 16} y={layout.yFor(score)} textAnchor="end" dominantBaseline="middle" fontSize={9} fill={ink.muted}>
                  {score}
                </text>
              </g>
            ))}

            <text x={layout.leftX} y={20} textAnchor="middle" fontSize={11} fontWeight={700} fill={ink.ink}>
              Before
            </text>
            <text x={layout.rightX} y={20} textAnchor="middle" fontSize={11} fontWeight={700} fill={ink.ink}>
              After
            </text>
            <line x1={layout.leftX} y1={layout.topY - 8} x2={layout.leftX} y2={layout.bottomY + 8} stroke={ink.track} />
            <line x1={layout.rightX} y1={layout.topY - 8} x2={layout.rightX} y2={layout.bottomY + 8} stroke={ink.track} />

            {layout.rows.map((r) => {
              const color = r.worse ? colors.High : colors.Low;
              return (
                <g key={r.tool_id} opacity={0.9}>
                  <line x1={layout.leftX} y1={r.y1} x2={layout.rightX} y2={r.y2} stroke={color} strokeWidth={2}>
                    <title>
                      {r.tool_name} ({r.department}): {r.previous_risk_score} &rarr; {r.risk_score} ({r.worse ? "+" : ""}
                      {r.delta})
                    </title>
                  </line>
                  <circle cx={layout.leftX} cy={r.y1} r={3.5} fill={color} stroke={ink.ring} strokeWidth={1.5} />
                  <circle cx={layout.rightX} cy={r.y2} r={3.5} fill={color} stroke={ink.ring} strokeWidth={1.5} />
                  {r.labeled && (
                    <text x={layout.rightX + 12} y={r.y2} dominantBaseline="middle" fontSize={10} fontWeight={600} fill={ink.ink}>
                      {r.tool_name}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </>
      )}
    </div>
  );
}
