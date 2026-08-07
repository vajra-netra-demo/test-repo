import { ShieldAlert } from "lucide-react";
import type { PermissionChanges } from "../../types";

// Renders GET /discovery/permission-changes — a real diff against
// previous_oauth_scopes, captured right before a live tool's row is
// replaced on each discovery cycle (scan_pipeline.py). Only ever populated
// for live-sourced tools. This is permission-creep detection: a tool that
// gained access it didn't have last scan, without anyone re-approving it —
// the closest honest substitute this project has for "continuous
// behavioral monitoring" without claiming real-time anomaly detection it
// doesn't do.
export function PermissionChangesPanel({ data, loading }: { data: PermissionChanges | null; loading: boolean }) {
  if (loading || !data) {
    return (
      <div className="glass rounded-xl p-5 text-[13px] text-muted">
        {loading ? "Computing permission changes…" : "No scan data yet."}
      </div>
    );
  }

  return (
    <div className="glass glass-hover rounded-xl p-5">
      <p className="mb-4.5 text-[11px] font-semibold uppercase leading-relaxed tracking-wide text-muted">
        Tools whose granted OAuth permissions changed since their last live discovery — a real diff against
        what each tool was actually granted last scan, not an inferred signal. Only tracked for
        live-discovered tools; sample data's scopes never change.
      </p>

      {data.changes.length === 0 ? (
        <div className="p-6 text-center text-[13px] text-muted">
          No permission changes detected on any live-discovered tool yet — run another live scan to build a
          comparison point.
        </div>
      ) : (
        <>
          <div className="mb-3.5 text-[12px] text-muted">
            {data.total_changes_found} tool{data.total_changes_found !== 1 ? "s" : ""} changed
            {data.total_changes_found > data.changes.length ? ` (showing top ${data.changes.length})` : ""}
          </div>
          <div className="flex flex-col gap-2.5">
            {data.changes.map((c) => (
              <div key={c.tool_id} className="relative overflow-hidden rounded-lg border border-border py-3 pl-4 pr-4">
                <div
                  className={`absolute inset-y-0 left-0 w-[3px] ${c.scopes_added.length > 0 ? "bg-high" : "bg-low"}`}
                  title={c.scopes_added.length > 0 ? "Gained new permissions" : "Lost permissions"}
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-[13px]">
                    {c.scopes_added.length > 0 && <ShieldAlert size={13} strokeWidth={2.25} className="shrink-0 text-high" />}
                    <span className="font-bold text-text">{c.tool_name}</span>
                    <span className="text-[11px] text-muted">{c.department}</span>
                  </div>
                  {c.risk_score !== null && (
                    <span className="font-mono text-[13px] font-semibold text-text">{c.risk_score}</span>
                  )}
                </div>
                {c.scopes_added.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    <span className="text-[10.5px] font-semibold uppercase tracking-wide text-high">+ Gained:</span>
                    {c.scopes_added.map((s) => (
                      <span key={s} className="rounded bg-high-bg px-1.5 py-0.25 text-[10.5px] font-semibold text-high-dark">
                        {s}
                      </span>
                    ))}
                  </div>
                )}
                {c.scopes_removed.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    <span className="text-[10.5px] font-semibold uppercase tracking-wide text-low">- Lost:</span>
                    {c.scopes_removed.map((s) => (
                      <span key={s} className="rounded bg-low-bg px-1.5 py-0.25 text-[10.5px] font-semibold text-low-dark">
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
