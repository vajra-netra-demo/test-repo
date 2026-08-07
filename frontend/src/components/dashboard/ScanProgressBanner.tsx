import { Hourglass } from "lucide-react";
import type { ScanProgress } from "../../types";

const PHASE_LABEL: Record<string, string> = {
  starting: "Starting live scan",
  discovering: "Discovering live tools",
  assessing: "Running risk assessment",
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
  const phase = progress?.phase ?? "starting";
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
        </div>
        <div className="mt-0.5 text-[12px] text-accent/80">
          This can take a few minutes for a large tool count. Feel free to keep browsing the
          dashboard meanwhile.
        </div>
      </div>
    </div>
  );
}
