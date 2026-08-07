import { Loader2 } from "lucide-react";
import type { ScanProgress } from "../../types";

const PHASE_LABEL: Record<string, string> = {
  starting: "Starting live scan…",
  discovering: "Discovering live tools…",
  assessing: "Running risk assessment…",
};

// The "Run Live Scan" button already shows a spinner + disabled state, but
// that's easy to miss once you've scrolled past it — a scan can run for a
// few minutes on a large tool count. This is a second, more visible
// indicator near the top of the page that stays up for the whole run, and
// now shows real per-tool progress (backend/app/scan_pipeline.py's
// on_progress callback) rather than just "still working, trust me."
export function ScanProgressBanner({ progress }: { progress: ScanProgress | null }) {
  const phase = progress?.phase ?? "starting";
  const total = progress?.total ?? 0;
  const current = progress?.current ?? 0;
  // total is 0 during "starting" (counts not known yet) and for the whole
  // duration of the Celery parallel path (no in-process counter to report
  // from — see scan_pipeline.py) — both fall back to the indeterminate
  // sweep rather than showing a fabricated percentage.
  const known = total > 0;
  const pct = known ? Math.min(100, Math.round((current / total) * 100)) : 0;

  return (
    <div className="animate-view-fade glass mb-5 overflow-hidden rounded-xl border border-accent/30 bg-accent-light">
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-[13px] font-semibold text-accent">
        <span className="flex items-center gap-3">
          <Loader2 size={16} strokeWidth={2.5} className="shrink-0 animate-spin" />
          {PHASE_LABEL[phase] ?? "Live scan in progress…"}
          {known && (
            <span className="font-mono tabular-nums text-accent-dark">
              {current} / {total}
            </span>
          )}
        </span>
        <span className="hidden font-mono text-[12px] tabular-nums sm:inline">
          {known ? `${pct}%` : "feel free to keep browsing meanwhile"}
        </span>
      </div>
      <div className="h-[3px] w-full overflow-hidden bg-accent/15">
        {known ? (
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent-dark to-accent transition-[width] duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        ) : (
          <div className="animate-scan-sweep h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-accent to-transparent" />
        )}
      </div>
    </div>
  );
}
