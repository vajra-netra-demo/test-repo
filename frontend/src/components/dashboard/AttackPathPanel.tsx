import { ArrowRight, Share2 } from "lucide-react";
import type { AttackPaths } from "../../types";
import { riskLevel } from "../../lib/risk";
import { RiskBadge } from "../Badge";

// Renders backend/app/graph_analysis.py::compute_attack_paths — real 2-hop
// traversal over the same access graph GraphInsightsPanel.tsx visualizes,
// from each High-risk tool to other tools sharing its department or data
// category. Deliberately framed as structural reachability, not a
// simulated attack: every edge shown is a real fact about real discovered
// tools (same discipline app/attack_mapping.py's docstring already
// established for this codebase — explain a finding in attacker terms,
// don't act like an attacker).
export function AttackPathPanel({ data, loading }: { data: AttackPaths | null; loading: boolean }) {
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

      {data.paths.length === 0 ? (
        <div className="p-6 text-center text-[13px] text-muted">
          {data.high_risk_source_count === 0
            ? "No High-risk tools currently discovered — no attack paths to compute."
            : "No shared-department or shared-data-category paths found from current High-risk tools."}
        </div>
      ) : (
        <>
          <div className="mb-3.5 text-[12px] text-muted">
            {data.high_risk_source_count} High-risk tool{data.high_risk_source_count !== 1 ? "s" : ""} &middot;{" "}
            {data.total_paths_found} path{data.total_paths_found !== 1 ? "s" : ""} found
            {data.total_paths_found > data.paths.length ? ` (showing top ${data.paths.length})` : ""}
          </div>
          <div className="flex flex-col gap-2.5">
            {data.paths.map((p, i) => {
              const fromLevel = riskLevel(p.from_risk_score);
              const toLevel = riskLevel(p.to_risk_score);
              return (
                <div
                  key={`${p.from_tool}-${p.to_tool}-${p.via_kind}-${p.via_name}-${i}`}
                  className="relative overflow-hidden rounded-lg border border-border py-3 pl-4 pr-4"
                >
                  <div
                    className={`absolute inset-y-0 left-0 w-[3px] ${p.via_kind === "department" ? "bg-accent" : "bg-faint"}`}
                    title={p.via_kind === "department" ? "Shared department — a stronger signal" : "Shared data category"}
                  />
                  <div className="flex flex-wrap items-center gap-2 text-[13px]">
                    <span className="font-bold text-text">{p.from_tool}</span>
                    {fromLevel && <RiskBadge level={fromLevel} />}
                    <ArrowRight size={14} strokeWidth={2.25} className="shrink-0 text-muted" />
                    <span className="font-bold text-text">{p.to_tool}</span>
                    {toLevel && <RiskBadge level={toLevel} />}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-muted">
                    <Share2 size={11} strokeWidth={2.25} className="shrink-0" />
                    Shared {p.via_kind === "department" ? "department" : "data category"}:{" "}
                    <span className="font-semibold text-text">{p.via_name}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
