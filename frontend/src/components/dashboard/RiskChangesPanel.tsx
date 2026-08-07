import { ArrowDown, ArrowUp } from "lucide-react";
import type { RiskChanges } from "../../types";

// Renders GET /discovery/risk-changes — a real cross-scan diff using
// previous_risk_score, captured right before every overwrite
// (scan_pipeline.py/tasks.py). Deliberately framed as "since its last
// reassessment," not "continuous behavioral monitoring": this is a
// one-step-back comparison, not a full time-series, and says so.
export function RiskChangesPanel({ data, loading }: { data: RiskChanges | null; loading: boolean }) {
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
        Tools whose risk score moved since their last reassessment — a one-step-back comparison, not
        continuous monitoring across a full history.
      </p>

      {data.changes.length === 0 ? (
        <div className="p-6 text-center text-[13px] text-muted">
          No tools have changed risk score since their previous reassessment yet — run another scan to
          build a comparison point.
        </div>
      ) : (
        <>
          <div className="mb-3.5 text-[12px] text-muted">
            {data.total_changes_found} tool{data.total_changes_found !== 1 ? "s" : ""} changed
            {data.total_changes_found > data.changes.length ? ` (showing top ${data.changes.length})` : ""}
          </div>
          <div className="flex flex-col gap-2.5">
            {data.changes.map((c) => {
              const worse = c.delta > 0;
              return (
                <div
                  key={c.tool_id}
                  className="relative overflow-hidden rounded-lg border border-border py-3 pl-4 pr-4"
                >
                  <div
                    className={`absolute inset-y-0 left-0 w-[3px] ${worse ? "bg-high" : "bg-low"}`}
                    title={worse ? "Got riskier" : "Got safer"}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-[13px]">
                      <span className="font-bold text-text">{c.tool_name}</span>
                      <span className="text-[11px] text-muted">{c.department}</span>
                    </div>
                    <div className="flex items-center gap-1.5 font-mono text-[13px] font-semibold tabular-nums">
                      <span className="text-muted">{c.previous_risk_score}</span>
                      {worse ? (
                        <ArrowUp size={13} strokeWidth={2.5} className="text-high" />
                      ) : (
                        <ArrowDown size={13} strokeWidth={2.5} className="text-low" />
                      )}
                      <span className={worse ? "text-high" : "text-low"}>{c.risk_score}</span>
                      <span className={`ml-1 text-[11px] ${worse ? "text-high" : "text-low"}`}>
                        ({worse ? "+" : ""}
                        {c.delta})
                      </span>
                    </div>
                  </div>
                  {c.risk_flags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {c.risk_flags.map((f) => (
                        <span
                          key={f}
                          className="rounded bg-tint/[0.06] px-1.5 py-0.25 text-[10.5px] font-semibold text-text"
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
