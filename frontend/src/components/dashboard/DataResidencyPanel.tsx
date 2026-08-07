import { useMemo } from "react";
import type { SaaSTool } from "../../types";
import { riskLevel } from "../../lib/risk";

// hosting_region/hosting_region_source already exist per-tool (backend/app/
// network_intel.py) — declared for sample data, real DNS+GeoIP-resolved for
// live-discovered tools — but were only ever surfaced in a single tool's
// expanded row in the Discovered Tools table. This aggregates that
// already-real data into a "where does this org's data actually go"
// dashboard view, which never existed before.
//
// Endpoint-sourced rows are excluded: those are locally-installed software/
// extensions, not a cloud OAuth grant, so "hosting region" isn't a
// meaningful question for them (see routers/endpoint.py's placeholder
// value) — counted separately instead of forced into the region breakdown.
const INDIA_ALIASES = new Set(["india"]);

function isCrossBorder(region: string): boolean {
  const r = region.trim().toLowerCase();
  return r !== "unknown" && !INDIA_ALIASES.has(r);
}

export function DataResidencyPanel({ tools }: { tools: SaaSTool[] }) {
  const stats = useMemo(() => {
    const cloudTools = tools.filter((t) => t.source !== "endpoint");
    const endpointCount = tools.length - cloudTools.length;

    const byRegion = new Map<
      string,
      { count: number; high: number; geoipCount: number; declaredCount: number }
    >();
    for (const t of cloudTools) {
      const region = t.hosting_region || "Unknown";
      const entry = byRegion.get(region) ?? { count: 0, high: 0, geoipCount: 0, declaredCount: 0 };
      entry.count++;
      if (riskLevel(t.risk_score) === "High") entry.high++;
      if (t.hosting_region_source === "geoip-lookup") entry.geoipCount++;
      else if (t.hosting_region_source === "declared") entry.declaredCount++;
      byRegion.set(region, entry);
    }

    const regions = [...byRegion.entries()]
      .map(([region, v]) => ({ region, ...v }))
      .sort((a, b) => b.count - a.count);

    const crossBorderCount = regions
      .filter((r) => isCrossBorder(r.region))
      .reduce((sum, r) => sum + r.count, 0);
    const verifiedCount = cloudTools.filter((t) => t.hosting_region_source === "geoip-lookup").length;

    return { cloudTools, endpointCount, regions, crossBorderCount, verifiedCount };
  }, [tools]);

  const { cloudTools, endpointCount, regions, crossBorderCount, verifiedCount } = stats;

  return (
    <div className="glass glass-hover rounded-xl p-5">
      <p className="mb-4.5 text-[11px] font-semibold uppercase leading-relaxed tracking-wide text-muted">
        Where discovered tools host organizational data — vendor-declared for sample data, resolved via a real
        DNS + GeoIP lookup (and TLS certificate read) for live-discovered tools. A DNS/GeoIP signal, not network
        traffic capture — a domain behind a CDN may geolocate to the nearest edge, not the vendor's true origin.
      </p>

      <div className="mb-4.5 grid grid-cols-3 gap-3.5">
        <StatCard label="Cross-Border (Outside India)" value={crossBorderCount.toString()} colorClass="text-med" />
        <StatCard label="GeoIP-Verified" value={verifiedCount.toString()} colorClass="text-accent" />
        <StatCard label="Local / Endpoint (N/A)" value={endpointCount.toString()} colorClass="text-muted" />
      </div>

      {cloudTools.length === 0 ? (
        <div className="p-6 text-center text-[13px] text-muted">
          No cloud-hosted tools discovered yet — nothing to place on a residency map.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {regions.map((r) => (
            <div
              key={r.region}
              className="flex items-center justify-between gap-3 rounded-lg border border-border px-3.5 py-2.5"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-[13px] font-semibold text-text">{r.region}</span>
                {r.geoipCount > 0 && (
                  <span className="shrink-0 rounded bg-accent-light px-1.5 py-0.25 text-[10px] font-semibold uppercase text-accent">
                    {r.geoipCount} GeoIP
                  </span>
                )}
                {r.declaredCount > 0 && (
                  <span className="shrink-0 rounded bg-tint/[0.06] px-1.5 py-0.25 text-[10px] font-semibold uppercase text-muted">
                    {r.declaredCount} Declared
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-3 font-mono text-[13px]">
                {r.high > 0 && <span className="font-semibold text-high">{r.high} high-risk</span>}
                <span className="font-semibold text-text">
                  {r.count} tool{r.count !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 border-t border-border pt-3 text-[10.5px] leading-relaxed text-muted">
        {endpointCount} locally-installed tool{endpointCount !== 1 ? "s" : ""} (browser extensions, desktop
        software) excluded above — "hosting region" isn't a meaningful question for software that doesn't send
        data to a vendor's cloud. Only cloud/OAuth-connected tools are placed on this map.
      </div>
    </div>
  );
}

function StatCard({ label, value, colorClass }: { label: string; value: string; colorClass: string }) {
  return (
    <div className="glass rounded-lg p-3.5 px-4 transition-all duration-150 hover:-translate-y-0.5 hover:bg-card-hover">
      <div className={`font-mono text-[22px] font-semibold tabular-nums ${colorClass}`}>{value}</div>
      <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
}
