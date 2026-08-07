import { useEffect, useMemo, useState } from "react";
import { ShieldOff, TriangleAlert, X } from "lucide-react";
import type { AttackTechnique, SaaSTool, ToolSource } from "../../types";
import { riskLevel } from "../../lib/risk";
import { RiskBadge } from "../Badge";
import { Pagination } from "../Pagination";
import { usePagination } from "../../hooks/usePagination";
import { api, ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { useToast } from "../Toaster";
import type { KpiFilter } from "./KpiRow";

type SortKey = "tool_name" | "department" | "risk_score" | "triage_decision";
type FilterTab = "all" | ToolSource;

const TABS: Array<{ key: FilterTab; label: string }> = [
  { key: "all", label: "All" },
  { key: "sample", label: "Sample Data" },
  { key: "live", label: "Live Scan" },
];

const TRIAGE_CLASSES: Record<string, string> = {
  "auto-fix": "bg-high-bg text-high-dark ring-1 ring-inset ring-high/30",
  "manual-review": "bg-med-bg text-med-dark ring-1 ring-inset ring-med/30",
  ignore: "bg-tint/[0.06] text-muted",
};

interface ToolsTableProps {
  tools: SaaSTool[];
  onReload: () => void | Promise<void>;
  // Driven by the KPI cards above (Dashboard) — clicking "High risk" etc.
  // filters this table down without touching the charts, which still
  // reflect the full unfiltered set.
  riskFilter: KpiFilter;
  onClearRiskFilter: () => void;
}

export function ToolsTable({ tools, onReload, riskFilter, onClearRiskFilter }: ToolsTableProps) {
  const [filter, setFilter] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("risk_score");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const rows = useMemo(() => {
    let filtered = filter === "all" ? tools : tools.filter((t) => t.source === filter);
    if (riskFilter !== "all") {
      filtered = filtered.filter((t) => riskLevel(t.risk_score) === riskFilter);
    }

    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.tool_name.toLowerCase().includes(q) ||
          t.department.toLowerCase().includes(q) ||
          (t.vendor || "").toLowerCase().includes(q),
      );
    }

    return [...filtered].sort((a, b) => {
      let av: string | number = a[sortKey] ?? "";
      let bv: string | number = b[sortKey] ?? "";
      // Only lowercase when BOTH sides are strings -- risk_score is numeric
      // but null for a not-yet-assessed tool, and the ?? "" fallback above
      // turns that null into a string while a real score on the other side
      // stays a number. Calling .toLowerCase() on that number crashed the
      // whole table (risk_score is the default sort column, so this fired
      // on page load for any tenant with even one unassessed tool).
      if (typeof av === "string" && typeof bv === "string") {
        av = av.toLowerCase();
        bv = bv.toLowerCase();
      }
      if (av === bv) return 0;
      return av > bv ? sortDir : -sortDir;
    });
  }, [tools, filter, riskFilter, search, sortKey, sortDir]);

  const { page, setPage, pageSize, setPageSize, pageCount, paged, totalRows } = usePagination(rows);

  function onSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1) as 1 | -1);
    else {
      setSortKey(key);
      setSortDir(-1);
    }
  }

  return (
    <div>
      {riskFilter !== "all" && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-accent/30 bg-accent-light px-3.5 py-2 text-[12.5px] font-semibold text-accent">
          Showing {riskFilter.toLowerCase()} risk tools only — from the KPI card above
          <button
            onClick={onClearRiskFilter}
            className="ml-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] transition-colors hover:bg-tint/[0.08]"
          >
            <X size={12} strokeWidth={2.5} /> Clear
          </button>
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg bg-tint/[0.04] p-1">
          {TABS.map((tab) => (
            <div
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`cursor-pointer rounded-md px-3.5 py-1.5 text-[13px] font-semibold transition-all duration-150 ${
                filter === tab.key ? "bg-accent-light text-accent" : "text-muted hover:text-text"
              }`}
            >
              {tab.label}
            </div>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tool, department, vendor…"
          className="glass w-[220px] rounded-lg px-3 py-2 text-[13px] text-text transition-colors placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
      </div>

      <div className="glass overflow-hidden rounded-xl">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <SortableHeader label="Tool" sortKey="tool_name" active={sortKey} onSort={onSort} />
              <SortableHeader label="Department" sortKey="department" active={sortKey} onSort={onSort} />
              {/* Surfaced here (not just in the expanded row) so "where does
                  this tool's data live" is visible at a glance — the same
                  real hosting_region/hosting_region_source data the Data
                  Residency panel aggregates. */}
              <th className="border-b border-border bg-tint/[0.02] px-3.5 py-2.75 text-left text-[10.5px] font-bold uppercase tracking-wide text-muted">
                Hosting
              </th>
              {/* Not independently sortable — Risk level is just a bucketed
                  view of Score (same underlying value), so it shares
                  Score's sort rather than getting its own SortableHeader.
                  Having both bound to the same sortKey previously made both
                  headers light up as "active" at once, which read as a
                  layout bug rather than two columns agreeing on one sort. */}
              <th className="border-b border-border bg-tint/[0.02] px-3.5 py-2.75 text-left text-[10.5px] font-bold uppercase tracking-wide text-muted">
                Risk
              </th>
              <SortableHeader label="Score" sortKey="risk_score" active={sortKey} onSort={onSort} />
              <SortableHeader label="Triage Agent" sortKey="triage_decision" active={sortKey} onSort={onSort} />
              {/* Moved after Triage Agent — usually "—" for the common
                  Low-risk case, so it reads better as the last, most-
                  detailed column rather than crowding the glanceable ones. */}
              <th className="border-b border-border bg-tint/[0.02] px-3.5 py-2.75 text-left text-[10.5px] font-bold uppercase tracking-wide text-muted">
                Flags
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-10 text-center text-muted">
                  No tools found.
                </td>
              </tr>
            ) : (
              paged.map((t) => (
                <ToolRow
                  key={t.id}
                  tool={t}
                  expanded={expandedId === t.id}
                  onToggle={() => setExpandedId((id) => (id === t.id ? null : t.id))}
                  onReload={onReload}
                />
              ))
            )}
          </tbody>
        </table>
        <Pagination
          page={page}
          pageCount={pageCount}
          pageSize={pageSize}
          totalRows={totalRows}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>
    </div>
  );
}

function SortableHeader({
  label,
  sortKey,
  active,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  onSort: (key: SortKey) => void;
}) {
  return (
    <th
      onClick={() => onSort(sortKey)}
      className={`cursor-pointer border-b border-border bg-tint/[0.02] px-3.5 py-2.75 text-left text-[10.5px] font-bold uppercase tracking-wide select-none transition-colors hover:bg-accent-light ${
        active === sortKey ? "text-accent" : "text-muted"
      }`}
    >
      {label} <span className={`ml-0.5 ${active === sortKey ? "opacity-70" : "opacity-40"}`}>&#8597;</span>
    </th>
  );
}

function ToolRow({
  tool,
  expanded,
  onToggle,
  onReload,
}: {
  tool: SaaSTool;
  expanded: boolean;
  onToggle: () => void;
  onReload: () => void | Promise<void>;
}) {
  const { showToast } = useToast();
  const { isAdmin } = useAuth();
  const [busy, setBusy] = useState(false);
  const level = riskLevel(tool.risk_score);
  const isGithubLive = tool.source === "live" && tool.id.startsWith("live-gh-");

  const hasFlags = (tool.risk_flags?.length ?? 0) > 0;
  const [techniques, setTechniques] = useState<AttackTechnique[] | null>(null);
  const [techniquesLoading, setTechniquesLoading] = useState(false);
  const [techniquesFailed, setTechniquesFailed] = useState(false);

  // Lazy-loaded on first expand, same as the vanilla dashboard's version —
  // no point fetching a mapping for a row nobody opens.
  useEffect(() => {
    if (!expanded || !hasFlags || techniques !== null || techniquesLoading || techniquesFailed) return;
    setTechniquesLoading(true);
    api
      .getAttackMapping(tool.id)
      .then((data) => setTechniques(data.techniques))
      .catch(() => setTechniquesFailed(true))
      .finally(() => setTechniquesLoading(false));
  }, [expanded, hasFlags, tool.id, techniques, techniquesLoading, techniquesFailed]);

  async function toggleRemediated() {
    setBusy(true);
    try {
      await api.setRemediated(tool.id, !tool.remediated);
      await onReload();
    } finally {
      setBusy(false);
    }
  }

  async function runAutoFix() {
    const confirmed = window.confirm(
      `This will ACTUALLY revoke "${tool.tool_name}"'s access on your real GitHub organization — ` +
        `it will be uninstalled for real, not simulated. This cannot be undone from here (you'd need ` +
        `to reinstall it from GitHub Marketplace). Continue?`,
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      const data = await api.autoFixTool(tool.id);
      showToast(`Access revoked for real. New readiness score: ${data.readiness_score}/100.`, "success");
      await onReload();
    } catch (e) {
      const message = e instanceof ApiError ? e.message : String(e);
      showToast(`Auto-fix failed: ${message}`, "error");
      setBusy(false);
    }
  }

  return (
    <>
      <tr
        onClick={onToggle}
        className={`cursor-pointer transition-colors hover:bg-accent-light/60 ${expanded ? "bg-accent-light/60" : ""}`}
      >
        <td className="border-b border-border px-3.5 py-2.75 text-[13px] text-text">
          {tool.tool_name}
          <span
            className={`ml-1.75 rounded px-1.75 py-0.5 text-[9.5px] font-bold uppercase ${
              tool.source === "live" ? "bg-accent-light text-accent" : "bg-tint/[0.06] text-muted"
            }`}
          >
            {tool.source}
          </span>
          {tool.remediated && (
            <span className="ml-1.75 rounded bg-low-bg px-1.75 py-0.5 text-[9.5px] font-bold uppercase text-low-dark">
              Remediated
            </span>
          )}
        </td>
        <td className="border-b border-border px-3.5 py-2.75 text-[13px] text-text">{tool.department}</td>
        <td className="border-b border-border px-3.5 py-2.75 text-[13px] text-text">
          {tool.source === "endpoint" ? (
            <span className="text-muted">—</span>
          ) : (
            <>
              {tool.hosting_region}
              {tool.hosting_region_source === "geoip-lookup" && (
                <span
                  className="ml-1.5 rounded px-1.5 py-0.25 text-[9.5px] font-bold uppercase tracking-wide text-faint"
                  title="Resolved via real DNS + GeoIP lookup against the vendor's actual domain — not a self-reported value. CDN-fronted domains geolocate to the nearest edge, not necessarily the vendor's true origin."
                >
                  DNS/GeoIP
                </span>
              )}
            </>
          )}
        </td>
        <td className="border-b border-border px-3.5 py-2.75 text-[13px]">
          {level ? <RiskBadge level={level} /> : "—"}
        </td>
        <td className="border-b border-border px-3.5 py-2.75 text-[13px] font-mono text-text">
          {tool.risk_score ?? "—"}
        </td>
        <td className="border-b border-border px-3.5 py-2.75 text-[13px]">
          {tool.triage_decision ? (
            <span className={`inline-block rounded px-2.5 py-0.75 text-[11px] font-bold ${TRIAGE_CLASSES[tool.triage_decision] ?? ""}`}>
              {tool.triage_decision}
            </span>
          ) : (
            "—"
          )}
        </td>
        <td className="border-b border-border px-3.5 py-2.75 text-[13px]">
          {tool.risk_flags && tool.risk_flags.length > 0
            ? tool.risk_flags.map((f) => (
                <span
                  key={f}
                  className="mr-1 mb-0.5 inline-block rounded bg-tint/[0.06] px-2 py-0.5 text-[11px] font-semibold text-text"
                >
                  {f}
                </span>
              ))
            : "—"}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-tint/[0.02]">
          <td colSpan={7} className="border-b border-border px-3.5 py-2.75 text-[13px] text-muted">
            <div className="mb-2 leading-relaxed text-text">
              {tool.risk_reasoning || "Not yet assessed — run the Day 3 risk assessment."}
            </div>
            <div>
              <strong className="text-text">Scopes:</strong> {(tool.oauth_scopes || []).join(", ") || "—"}
            </div>
            <div>
              <strong className="text-text">Data accessed:</strong> {(tool.data_categories_accessed || []).join(", ") || "—"}
            </div>
            <div>
              <strong className="text-text">Last used:</strong> {tool.last_used}
            </div>
            {tool.resolved_ip && (
              <div className="mt-1">
                <strong className="text-text">Resolved IP:</strong>{" "}
                <span className="font-mono">{tool.resolved_ip}</span>
              </div>
            )}
            {(tool.tls_issuer_org || tool.tls_subject_org) && (
              <div className="mt-1">
                <strong className="text-text">TLS certificate:</strong>{" "}
                {tool.tls_subject_org
                  ? `issued to ${tool.tls_subject_org}`
                  : "no organization name on cert (common for Let's Encrypt/DV certs)"}
                {tool.tls_issuer_org ? `, by ${tool.tls_issuer_org}` : ""} — a real TLS handshake, a second
                independent network signal alongside DNS/GeoIP.
              </div>
            )}
            {tool.triage_reasoning && (
              <div className="mb-2.5 mt-2 rounded-md border-l-3 border-accent bg-accent-light p-2 px-3 text-[12.5px] text-accent">
                <strong>Triage Agent ({tool.triage_decision}):</strong> {tool.triage_reasoning}
              </div>
            )}
            {hasFlags && (
              <div className="mb-2.5 mt-2 border-t border-dashed border-border pt-2">
                <div className="mb-1.5">
                  <strong className="text-text">MITRE ATT&amp;CK mapping</strong>{" "}
                  <span className="text-[11px] text-faint">
                    (real rule-mapping from this finding's flags — not a simulated attack)
                  </span>
                </div>
                {techniquesLoading && <div className="text-[11.5px] text-faint">Loading…</div>}
                {techniquesFailed && <div className="text-[11.5px] text-faint">Mapping unavailable.</div>}
                {techniques?.map((tech) => (
                  <div
                    key={tech.technique_id}
                    className="mb-1.5 max-w-full rounded-md border border-high/25 bg-high-bg/40 px-2.5 py-1.5 text-[11.5px]"
                  >
                    <span className="mr-1.5 font-extrabold text-high-dark">{tech.technique_id}</span>
                    <span className="font-semibold text-text">{tech.technique_name}</span> — {tech.tactic}
                    <div className="mt-0.75 text-faint">{tech.rationale}</div>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleRemediated();
              }}
              disabled={busy || !isAdmin}
              title={isAdmin ? undefined : "Admin only"}
              className={`mt-2 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.25 text-[12px] font-semibold transition-all duration-150 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 ${
                tool.remediated
                  ? "border-low/30 bg-low-bg text-low-dark"
                  : "glass glass-hover text-text"
              }`}
            >
              {tool.remediated ? (
                <>✓ Remediated — click to undo</>
              ) : (
                <>
                  <ShieldOff size={13} strokeWidth={2.25} /> Mark as Remediated
                </>
              )}
            </button>
            {isGithubLive && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  runAutoFix();
                }}
                disabled={busy || !isAdmin}
                title={isAdmin ? undefined : "Admin only"}
                className="ml-2 mt-2 inline-flex items-center gap-1.5 rounded-md border border-high/30 bg-high-bg px-3 py-1.25 text-[12px] font-semibold text-high-dark transition-all duration-150 hover:-translate-y-0.5 hover:bg-high hover:text-white hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
              >
                <TriangleAlert size={13} strokeWidth={2.25} /> Auto-Revoke Access on GitHub
              </button>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
