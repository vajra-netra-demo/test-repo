import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { api, ApiError } from "../../api/client";
import type { RegulationClause } from "../../types";
import { useToast } from "../Toaster";

export function RegulationView() {
  const { showToast } = useToast();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<RegulationClause[] | null>(null);
  const [empty, setEmpty] = useState<string | null>(null);

  async function runSearch() {
    const q = query.trim();
    if (!q) {
      showToast("Enter a search term first.", "error");
      return;
    }
    setSearching(true);
    setEmpty(null);
    try {
      const data = await api.searchRegulation(q, 5);
      if (!data.results || data.results.length === 0) {
        setResults(null);
        setEmpty("No results (or regulation search unavailable on this deployment).");
      } else {
        setResults(data.results);
      }
    } catch (e) {
      const message = e instanceof ApiError ? e.message : String(e);
      setResults(null);
      setEmpty(`Request failed: ${message}`);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="mb-0.5 text-[21px] font-semibold text-text">Regulation Search</h1>
        <p className="m-0 text-[13px] text-muted">
          Real TF-IDF retrieval over the DPDP/RBI/CERT-In/SEBI clause library — try different
          queries and notice the results actually change, the same proof-it's-not-static bar used
          for the LLM itself
        </p>
      </div>
      <div className="glass glass-hover rounded-xl p-5">
        <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") runSearch();
            }}
            placeholder="e.g. cross-border data transfer, incident reporting…"
            className="glass w-[340px] rounded-lg px-3 py-2 text-[13px] text-text placeholder:text-faint transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
          <button
            onClick={runSearch}
            disabled={searching}
            className="rounded-lg bg-gradient-to-b from-accent to-accent-dark px-4 py-2.25 text-[13px] font-semibold text-[#03151a] transition-all duration-150 hover:-translate-y-0.5 hover:shadow-accent-glow active:translate-y-0 disabled:translate-y-0 disabled:bg-tint/10 disabled:bg-none disabled:text-faint disabled:shadow-none"
          >
            {searching ? "Searching…" : "Search"}
          </button>
        </div>
        <div>
          {searching ? (
            <div className="p-10 text-center text-muted">Searching…</div>
          ) : empty ? (
            <div className="rounded-lg border border-dashed border-border bg-tint/[0.02] p-2.5 px-3.5 text-[12.5px] text-muted">
              {empty}
            </div>
          ) : (
            results?.map((c, i) => (
              <div
                key={i}
                className="glass mb-2.5 rounded-lg p-3 px-4 transition-all duration-150 hover:-translate-y-0.5 hover:border-accent/30"
              >
                <div className="text-[10.5px] font-bold uppercase tracking-wide text-accent">
                  {c.framework}
                </div>
                <div className="my-0.75 text-[14px] font-bold text-text">{c.topic}</div>
                <div className="text-[12.5px] leading-relaxed text-muted">{c.summary}</div>
                {c.citation && <div className="mt-1.5 font-mono text-[11px] text-accent">{c.citation}</div>}
                {c.caveat && (
                  <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-med-bg px-2 py-1 text-[11.5px] text-med-dark">
                    <TriangleAlert size={12} strokeWidth={2.25} /> {c.caveat}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
