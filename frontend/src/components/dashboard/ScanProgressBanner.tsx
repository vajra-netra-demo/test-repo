import { Loader2 } from "lucide-react";

// The "Run Live Scan" button already shows a spinner + disabled state, but
// that's easy to miss once you've scrolled past it — a scan can run for a
// few minutes on a large tool count. This is a second, more visible
// indicator near the top of the page that stays up for the whole run,
// not just a toast that fades after a few seconds.
export function ScanProgressBanner() {
  return (
    <div className="animate-view-fade glass mb-5 overflow-hidden rounded-xl border border-accent/30 bg-accent-light">
      <div className="flex items-center gap-3 px-4 py-3 text-[13px] font-semibold text-accent">
        <Loader2 size={16} strokeWidth={2.5} className="shrink-0 animate-spin" />
        Live scan in progress — this can take a few minutes for a large tool count. Feel free to
        keep browsing the dashboard meanwhile.
      </div>
      {/* Indeterminate progress bar — there's no real percentage to show
          (the backend doesn't report one), so this signals "still working"
          rather than implying measurable progress. */}
      <div className="h-[3px] w-full overflow-hidden bg-accent/15">
        <div className="animate-scan-sweep h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-accent to-transparent" />
      </div>
    </div>
  );
}
