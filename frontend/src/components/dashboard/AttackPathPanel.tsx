import { useMemo } from "react";
import type { AttackPaths } from "../../types";
import { chartInk, riskColors, riskLevel } from "../../lib/risk";
import { useTheme } from "../../theme/ThemeProvider";

// Renders backend/app/graph_analysis.py::compute_attack_paths as an actual
// node-link graph (tools as nodes on a circle, paths as directed edges)
// rather than a flat list — the data IS a graph (real 2-hop traversal over
// shared department/data-category edges from each High-risk tool), so the
// chart form matches the job: identity + connection, not magnitude.
// Deliberately framed as structural reachability, not a simulated attack:
// every edge shown is a real fact about real discovered tools (same
// discipline app/attack_mapping.py's docstring already established for
// this codebase).
export function AttackPathPanel({ data, loading }: { data: AttackPaths | null; loading: boolean }) {
  const { theme } = useTheme();
  const colors = riskColors(theme);
  const ink = chartInk(theme);

  const graph = useMemo(() => {
    if (!data || data.paths.length === 0) return null;

    const nodeScores = new Map<string, number | null>();
    data.paths.forEach((p) => {
      if (!nodeScores.has(p.from_tool)) nodeScores.set(p.from_tool, p.from_risk_score);
      if (!nodeScores.has(p.to_tool)) nodeScores.set(p.to_tool, p.to_risk_score);
    });
    const names = [...nodeScores.keys()];

    const w = 640,
      h = 460,
      cx = w / 2,
      cy = h / 2,
      r = Math.min(w, h) / 2 - 100;
    const angleFor = (i: number) => (i / names.length) * 2 * Math.PI - Math.PI / 2;
    const pos = new Map<string, { x: number; y: number; angle: number }>();
    names.forEach((name, i) => {
      const angle = angleFor(i);
      pos.set(name, { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), angle });
    });

    const edges = data.paths.map((p, i) => {
      const from = pos.get(p.from_tool)!;
      const to = pos.get(p.to_tool)!;
      // Bow each edge slightly toward center (chord-diagram style) instead
      // of a dead-straight spoke — makes overlapping edges distinguishable
      // and reads more like a graph than a wheel of identical lines.
      const mx = (from.x + to.x) / 2 + (cx - (from.x + to.x) / 2) * 0.25;
      const my = (from.y + to.y) / 2 + (cy - (from.y + to.y) / 2) * 0.25;
      return { ...p, key: `${p.from_tool}-${p.to_tool}-${p.via_kind}-${p.via_name}-${i}`, from, to, mx, my };
    });

    return { names, pos, edges, cx, cy, w, h };
  }, [data]);

  if (loading || !data) {
    return (
      <div className="glass rounded-xl p-5 text-[13px] text-muted">
        {loading ? "Computing attack paths…" : "No graph data yet."}
      </div>
    );
  }

  return (
    <div className="glass glass-hover rounded-xl p-5">
      <p className="mb-4.5 text-[11px] font-semibold uppercase leading-relaxed tracking-wide text-muted">
        Real 2-hop graph traversal from each High-risk tool through a shared department or data
        category — structural reachability from already-discovered data, not a simulated attack.
      </p>

      {!graph ? (
        <div className="p-6 text-center text-[13px] text-muted">
          {data.high_risk_source_count === 0
            ? "No High-risk tools currently discovered — no attack paths to compute."
            : "No shared-department or shared-data-category paths found from current High-risk tools."}
        </div>
      ) : (
        <>
          <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
            <span>
              {data.high_risk_source_count} High-risk tool{data.high_risk_source_count !== 1 ? "s" : ""} &middot;{" "}
              {data.total_paths_found} path{data.total_paths_found !== 1 ? "s" : ""} found
              {data.total_paths_found > data.paths.length ? ` (showing top ${data.paths.length})` : ""}
            </span>
            <div className="flex items-center gap-4 text-[11px]">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4" style={{ background: ink.accent }} />
                Shared department
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4" style={{ background: ink.muted }} />
                Shared data category
              </span>
            </div>
          </div>

          <svg
            width="100%"
            height={graph.h}
            viewBox={`0 0 ${graph.w} ${graph.h}`}
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              <marker id="attack-arrow-dept" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill={ink.accent} />
              </marker>
              <marker id="attack-arrow-cat" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill={ink.muted} />
              </marker>
            </defs>

            {graph.edges.map((e) => (
              <path
                key={e.key}
                d={`M${e.from.x},${e.from.y} Q${e.mx},${e.my} ${e.to.x},${e.to.y}`}
                fill="none"
                stroke={e.via_kind === "department" ? ink.accent : ink.muted}
                strokeWidth={1.75}
                opacity={0.65}
                markerEnd={e.via_kind === "department" ? "url(#attack-arrow-dept)" : "url(#attack-arrow-cat)"}
              >
                <title>
                  {e.from_tool} &rarr; {e.to_tool} (shared {e.via_kind === "department" ? "department" : "data category"}:{" "}
                  {e.via_name})
                </title>
              </path>
            ))}

            {graph.names.map((name) => {
              const p = graph.pos.get(name)!;
              const score = graph.edges.find((e) => e.from_tool === name)?.from_risk_score ??
                graph.edges.find((e) => e.to_tool === name)?.to_risk_score ??
                null;
              const level = riskLevel(score);
              const fill = level ? colors[level] : ink.muted;
              const onRight = Math.cos(p.angle) >= 0;
              return (
                <g key={name}>
                  <circle cx={p.x} cy={p.y} r={7} fill={fill} stroke={ink.ring} strokeWidth={2}>
                    <title>
                      {name}
                      {score !== null ? ` — risk score ${score}` : ""}
                    </title>
                  </circle>
                  {/* Always shown -- a security graph with no visible tool
                      identity isn't useful even when node count is high;
                      font shrinks a bit past a dozen nodes to reduce
                      collision, but text never disappears entirely. */}
                  <text
                    x={p.x + (onRight ? 11 : -11)}
                    y={p.y}
                    textAnchor={onRight ? "start" : "end"}
                    dominantBaseline="middle"
                    fontSize={graph.names.length > 12 ? 8.5 : 10}
                    fontWeight={600}
                    fill={ink.ink}
                  >
                    {name}
                  </text>
                </g>
              );
            })}
          </svg>
        </>
      )}
    </div>
  );
}
