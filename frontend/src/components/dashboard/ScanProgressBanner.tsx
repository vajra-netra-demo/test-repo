import { useRef } from "react";
import { Hourglass } from "lucide-react";
import type { ScanProgress } from "../../types";

// Formats a real extrapolated duration, not a fabricated countdown — see
// the phaseStartRef tracking below for where the estimate comes from.
function formatEta(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 8) return "finishing up";
  if (totalSeconds < 60) return `~${totalSeconds}s remaining`;
  const minutes = Math.round(totalSeconds / 60);
  return `~${minutes} min remaining`;
}

const PHASE_LABEL: Record<string, string> = {
  starting: "Starting live scan",
  discovering: "Discovering live tools",
  // Re-scores every tool in the org's inventory (sample + live + endpoint),
  // not just the newly-discovered ones from the "discovering" phase above —
  // named explicitly so the count here doesn't read as still counting the
  // small number of *new* tools just found a moment ago.
  assessing: "Re-assessing existing tools",
  cancelled: "Stopping scan",
  complete: "Scan complete",
};

const r = 26,
  cx = 30,
  cy = 30;
const CIRCUMFERENCE = 2 * Math.PI * r;

// The "Run Live Scan" button already shows a spinner + disabled state, but
// that's easy to miss once you've scrolled past it — a scan can run for a
// few minutes on a large tool count. This is a second, more visible
// indicator near the top of the page that stays up for the whole run, and
// shows real per-tool progress (backend/app/scan_pipeline.py's on_progress
// callback) as a circular percentage ring — same arc-drawing technique as
// ReadinessGauge.tsx, side-by-side with the status text the way that gauge
// sits beside its own label, rather than a full-width linear bar.
export function ScanProgressBanner({ progress }: { progress: ScanProgress | null }) {
  // cancel_requested flips as soon as Stop is clicked, even before the
  // running scan actually notices (run_full_cycle only checks between
  // tools) — shown ahead of whatever phase is currently reported, so the
  // click reads as acknowledged rather than looking like it did nothing.
  const stopping = !!progress?.cancel_requested;
  const phase = stopping ? "cancelled" : progress?.phase ?? "starting";
  const total = progress?.total ?? 0;
  const current = progress?.current ?? 0;
  // total is 0 only during "starting" (counts not known yet, before the
  // tool list is even fetched) — falls back to a spinning ring with no
  // percentage rather than showing a fabricated number. The Celery
  // parallel path now reports real progress too (GroupResult.completed_
  // count(), see scan_pipeline.py), so this isn't the permanent
  // no-progress case it used to be.
  const known = total > 0;
  const pct = known ? Math.min(100, Math.round((current / total) * 100)) : 0;
  const dash = (pct / 100) * CIRCUMFERENCE;

  // Real wall-clock throughput, not a fabricated countdown: remembers when
  // the CURRENT phase started (both time and count), so the estimate is
  // "how long has this phase's own rate taken to do N items, extrapolated
  // to the rest" rather than blending across phases with very different
  // per-item costs (discovering = one DB write/GitHub lookup per tool,
  // assessing = one real LLM call per tool in REAL mode — mixing those
  // would badly skew the number right at a phase boundary). Resets for
  // free every new scan since the parent only mounts this component while
  // `scanning` is true, so there's no cross-run stale state to clear.
  const phaseStartRef = useRef<{ phase: string; at: number; current: number } | null>(null);
  if (!phaseStartRef.current || phaseStartRef.current.phase !== phase) {
    phaseStartRef.current = { phase, at: Date.now(), current };
  }
  const doneInPhase = current - phaseStartRef.current.current;
  const etaLabel =
    known && phase !== "complete" && doneInPhase > 0
      ? formatEta(((Date.now() - phaseStartRef.current.at) / doneInPhase) * (total - current))
      : null;

  return (
    <div className="animate-view-fade glass mb-5 flex items-center gap-4 overflow-hidden rounded-xl border border-accent/30 bg-accent-light px-5 py-4">
      <div className="relative shrink-0">
        <svg
          width={60}
          height={60}
          viewBox="0 0 60 60"
          className={known ? "" : "animate-spin"}
          style={known ? undefined : { animationDuration: "1.4s" }}
        >
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeWidth={6} className="text-accent/15" />
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth={6}
            strokeLinecap="round"
            strokeDasharray={known ? `${dash} ${CIRCUMFERENCE - dash}` : `${CIRCUMFERENCE * 0.25} ${CIRCUMFERENCE * 0.75}`}
            transform={`rotate(-90 ${cx} ${cy})`}
            className="text-accent transition-[stroke-dasharray] duration-500 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-accent">
          <Hourglass size={14} strokeWidth={2.25} />
          {known && <span className="mt-0.5 font-mono text-[11px] font-bold tabular-nums">{pct}%</span>}
        </div>
      </div>

      <div className="min-w-0">
        <div className="text-[13.5px] font-bold text-accent">
          {PHASE_LABEL[phase] ?? "Live scan in progress"}
          {known && (
            <span className="ml-2 font-mono text-[12px] font-semibold tabular-nums text-accent-dark">
              {current} / {total}
            </span>
          )}
          {etaLabel && !stopping && (
            <span className="ml-2 font-mono text-[12px] font-semibold text-accent-dark">· {etaLabel}</span>
          )}
        </div>
        <div className="mt-0.5 text-[12px] text-accent/80">
          {stopping
            ? "Finishing whatever's already in flight, then stopping — whatever's been assessed so far is kept."
            : etaLabel
              ? "Estimate based on this scan's own progress so far — updates as it goes."
              : "This can take a few minutes for a large tool count. Feel free to keep browsing the dashboard meanwhile."}
        </div>
      </div>
    </div>
  );
}
