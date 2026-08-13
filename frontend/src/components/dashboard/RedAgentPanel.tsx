import { useState } from "react";
import { ShieldAlert, ChevronDown, ChevronUp } from "lucide-react";
import type { RedAgentFinding } from "../../types";

// Renders GET /discovery/red-agent-runs — real technique executions
// reported by netra-mvp/agent/red_agent.py. Deliberately narrow: every
// technique belongs to the MITRE ATT&CK Discovery tactic only (read-only
// enumeration, no credential access/persistence/lateral movement), run
// only against a machine the team itself owns. This panel exists to prove
// TriNetra can receive and label a real technique execution end-to-end —
// not to claim broad adversary-emulation coverage.
function groupByRun(findings: RedAgentFinding[]) {
  const runs = new Map<string, RedAgentFinding[]>();
  for (const f of findings) {
    const list = runs.get(f.run_id) ?? [];
    list.push(f);
    runs.set(f.run_id, list);
  }
  return [...runs.entries()]
    .map(([run_id, items]) => ({
      run_id,
      hostname: items[0].hostname,
      os: items[0].os,
      executed_at: items.reduce((max, i) => (i.executed_at > max ? i.executed_at : max), items[0].executed_at),
      items: items.sort((a, b) => a.technique_id.localeCompare(b.technique_id)),
    }))
    .sort((a, b) => (a.executed_at < b.executed_at ? 1 : -1));
}

function TechniqueRow({ finding }: { finding: RedAgentFinding }) {
  const [expanded, setExpanded] = useState(false);
  const output = finding.output_snippet ?? "";
  const isLong = output.length > 160;
  const preview = isLong && !expanded ? `${output.slice(0, 160)}…` : output;

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded bg-accent-light px-1.5 py-0.5 font-mono text-[11px] font-bold text-accent-dark">
            {finding.technique_id}
          </span>
          <span className="text-[13px] font-semibold text-text">{finding.technique_name}</span>
        </div>
        <span className="rounded bg-high-bg px-1.5 py-0.25 text-[10.5px] font-semibold uppercase tracking-wide text-high-dark">
          {finding.tactic}
        </span>
      </div>
      <div className="mt-1.5 font-mono text-[11px] text-muted">$ {finding.command}</div>
      <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap break-words rounded bg-bg px-2.5 py-2 font-mono text-[11px] leading-relaxed text-text">
        {preview || "(no output captured)"}
      </pre>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-accent hover:underline"
        >
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {expanded ? "Show less" : "Show full output"}
        </button>
      )}
    </div>
  );
}

export function RedAgentPanel({ data, loading }: { data: RedAgentFinding[] | null; loading: boolean }) {
  if (loading || !data) {
    return (
      <div className="glass rounded-xl p-5 text-[13px] text-muted">
        {loading ? "Loading Red Agent runs…" : "No scan data yet."}
      </div>
    );
  }

  const runs = groupByRun(data);

  return (
    <div className="glass glass-hover rounded-xl p-5">
      <p className="mb-4.5 flex items-start gap-2 text-[11px] font-semibold uppercase leading-relaxed tracking-wide text-muted">
        <ShieldAlert size={14} strokeWidth={2.25} className="mt-0.5 shrink-0 text-accent" />
        Real MITRE ATT&amp;CK Discovery-tactic techniques executed against a team-owned machine by
        netra-mvp/agent/red_agent.py — read-only enumeration only, no credential access, persistence, or
        lateral movement. Not a claim of full adversary emulation.
      </p>

      {runs.length === 0 ? (
        <div className="p-6 text-center text-[13px] text-muted">
          No Red Agent runs recorded yet — run <code className="font-mono">python red_agent.py</code> against
          this backend to see real technique executions here.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {runs.map((run) => (
            <div key={run.run_id} className="rounded-lg border border-border p-3.5">
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                <div className="text-[13px] font-bold text-text">
                  {run.hostname} <span className="font-normal text-muted">({run.os})</span>
                </div>
                <div className="font-mono text-[11px] text-muted">{run.executed_at}</div>
              </div>
              <div className="flex flex-col gap-2">
                {run.items.map((f) => (
                  <TechniqueRow key={f.id} finding={f} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
