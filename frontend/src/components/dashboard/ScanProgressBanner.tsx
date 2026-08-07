import { Loader2, Square } from "lucide-react";
import type { ScanProgress } from "../../types";

const PHASE_LABELS: Record<string, string> = {
  idle: "Idle",
  starting: "Starting scan…",
  discovering: "Discovering via live sources…",
  "assessing-live": "Scoring newly discovered tools…",
  "assessing-all": "Scoring all tools…",
  "assessing-all-parallel": "Scoring all tools (parallel via Celery)…",
  finalizing: "Finalizing and saving snapshot…",
};

// The "Run Live Scan" button already shows a spinner + disabled state, but
// that's easy to miss once you've scrolled past it — a scan can run for a
// few minutes on a large tool count. This is a second, more visible
// indicator near the top of the page that stays up for the whole run,
// not just a toast that fades after a few seconds.
//
// Driven by the backend's real phase/processed/total/current_tool fields
// (added to /discovery/scan-progress) rather than an indeterminate sweep —
// a genuine percentage and a live "Scored: X" feed, not a guess.
export function ScanProgressBanner({
  progress,
  onCancel,
  cancelling,
}: {
  progress: ScanProgress | null;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const phase = progress?.phase ?? "starting";
  const processed = progress?.processed ?? 0;
  const total = progress?.total ?? 0;
  const pct = total > 0 ? Math.round((processed / total) * 100) : phase === "discovering" ? 5 : 0;
  const label = PHASE_LABELS[phase] ?? phase;

  return (
    <div className="animate-view-fade glass mb-5 overflow-hidden rounded-xl border border-accent/30 bg-accent-light">
      <div className="flex items-center gap-3 px-4 py-3 text-[13px] font-semibold text-accent">
        <Loader2 size={16} strokeWidth={2.5} className="shrink-0 animate-spin" />
        <span className="flex-1">
          {label}
          {progress?.current_tool && total > 0 ? (
            <span className="ml-1 font-normal text-accent/80">
              — scored <strong className="font-semibold">{progress.current_tool}</strong> ({processed}/{total})
            </span>
          ) : null}
        </span>
        <span className="tabular-nums text-accent/80">{pct}%</span>
        <button
          type="button"
          onClick={onCancel}
          disabled={cancelling}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-accent/40 px-2.5 py-1 text-[12px] font-semibold text-accent transition-colors hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Square size={11} strokeWidth={2.5} />
          {cancelling ? "Stopping…" : "Stop scan"}
        </button>
      </div>
      <div className="h-[3px] w-full overflow-hidden bg-accent/15">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
          style={{ width: `${Math.max(pct, 4)}%` }}
        />
      </div>
    </div>
  );
}
