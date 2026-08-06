import type { GraphInsights, GraphInsightTool } from "../../types";
import { riskLevel } from "../../lib/risk";

// Renders backend/app/graph_analysis.py's real NetworkX metrics (degree +
// betweenness centrality, connected components) over the dept/tool/
// data-category graph — the AccessGraph.tsx Sankey above this is real
// counts but an illustrative layout; this panel is the actual computed
// graph analysis, ported from Dev's static/index.html "Graph Insights"
// section which the React rebuild had never wired up.
export function GraphInsightsPanel({ data, loading }: { data: GraphInsights | null; loading: boolean }) {
  if (loading || !data) {
    return (
      <div className="glass rounded-xl p-5 text-[13px] text-muted">
        {loading ? "Computing graph metrics…" : "No graph data yet."}
      </div>
    );
  }

  return (
    <div className="glass glass-hover rounded-xl p-5">
      <p className="mb-4.5 text-[11px] font-semibold uppercase leading-relaxed tracking-wide text-muted">
        Department &harr; tool &harr; data-category graph, analyzed in-process with NetworkX
        (degree/betweenness centrality, connected components) — not illustrative counts.
      </p>

      <div className="mb-5 grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <StatTile value={data.node_count} label="Graph nodes" />
        <StatTile value={data.edge_count} label="Graph edges" />
        <StatTile value={data.connected_components} label="Connected components" />
        <StatTile value={data.largest_component_size} label="Largest component size" />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <ToolList
          title="Most central tools"
          hint="(touch the most departments + data categories)"
          tools={data.most_central_tools}
        />
        <ToolList title="Bridge tools" hint="(sit on the most shortest-paths between other nodes)" tools={data.bridge_tools} />
      </div>

      <div className="mt-4.5 text-[10.5px] leading-relaxed text-faint">
        Recomputed fresh from current data on every load — an in-process NetworkX graph, not a
        deployed graph database.
      </div>
    </div>
  );
}

function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="glass rounded-lg p-3.5 px-4">
      <div className="font-mono text-[22px] font-semibold tabular-nums text-accent">{value}</div>
      <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
}

const SCORE_PILL_CLASSES = {
  High: "bg-high-bg text-high-dark ring-1 ring-inset ring-high/30",
  Medium: "bg-med-bg text-med-dark ring-1 ring-inset ring-med/30",
  Low: "bg-low-bg text-low-dark ring-1 ring-inset ring-low/30",
  none: "bg-tint/[0.06] text-muted ring-1 ring-inset ring-border",
};

function ToolList({ title, hint, tools }: { title: string; hint: string; tools: GraphInsightTool[] }) {
  return (
    <div>
      <h4 className="mb-3 text-[13px] font-bold text-text">
        {title} <span className="text-[11px] font-normal text-muted">{hint}</span>
      </h4>
      {tools.length === 0 ? (
        <div className="text-[13px] text-muted">No assessed tools yet.</div>
      ) : (
        <ul className="flex flex-col gap-2">
          {tools.map((t) => {
            const level = riskLevel(t.risk_score);
            return (
              <li key={t.tool_name} className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0 last:pb-0">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-[13px] text-text">{t.tool_name}</span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-[1px] text-[11px] font-bold tabular-nums ${SCORE_PILL_CLASSES[level ?? "none"]}`}
                    title={level ? `Risk score: ${t.risk_score}` : "Not yet assessed"}
                  >
                    {t.risk_score ?? "—"}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[13px] font-semibold tabular-nums text-accent">
                  {t.score.toFixed(4)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
