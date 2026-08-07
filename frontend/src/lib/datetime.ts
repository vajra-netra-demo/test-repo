// Backend timestamps are now stamped UTC-aware (explicit +00:00 offset —
// see backend/app/snapshot.py and friends) specifically so this can convert
// them to whatever timezone the viewer's own machine is set to, instead of
// printing the server's raw clock string (a Railway container runs in UTC,
// which reads hours off from IST). Falls back to the raw string for
// anything that fails to parse (e.g. a legacy naive timestamp recorded
// before this fix, or a malformed value) rather than showing "Invalid Date".
export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
