import { useEffect, useState } from "react";
import { api, ApiError } from "../../api/client";
import type { ClassificationScan, ClassifyResult } from "../../types";
import { useToast } from "../Toaster";
import { RiskBadge } from "../Badge";
import { Pagination } from "../Pagination";
import { usePagination } from "../../hooks/usePagination";
import type { RiskLevel } from "../../types";
import { formatTimestamp } from "../../lib/datetime";

function sensitivityLevel(score: number): RiskLevel {
  return score >= 70 ? "High" : score >= 30 ? "Medium" : "Low";
}

const LEVEL_TEXT_CLASS: Record<RiskLevel, string> = {
  High: "text-high",
  Medium: "text-med",
  Low: "text-low",
};

export function ClassifyView() {
  const { showToast } = useToast();
  const [text, setText] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ClassifyResult | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);
  const [history, setHistory] = useState<ClassificationScan[] | null>(null);
  const [historyUnavailable, setHistoryUnavailable] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const { page, setPage, pageSize, setPageSize, pageCount, paged, totalRows } = usePagination(history ?? []);

  async function loadHistory() {
    try {
      setHistory(await api.getClassifyHistory(20));
      setHistoryUnavailable(false);
      setHistoryError(false);
    } catch (e) {
      if (e instanceof ApiError) setHistoryUnavailable(true);
      else setHistoryError(true);
    }
  }

  useEffect(() => {
    loadHistory();
  }, []);

  async function runClassify() {
    const trimmed = text.trim();
    if (!trimmed) {
      showToast("Paste some text to classify first.", "error");
      return;
    }
    setBusy(true);
    setResult(null);
    setResultError(null);
    try {
      const data = await api.classifyText(trimmed, label.trim() || null);
      setResult(data);
      showToast("Classification complete.", "success");
      loadHistory();
    } catch (e) {
      const message =
        e instanceof ApiError
          ? e.message ||
            "not configured on this deployment (presidio-analyzer not installed — see the handover doc's operational caveats)."
          : String(e);
      setResultError(`Classification unavailable: ${message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="mb-0.5 text-[21px] font-semibold text-text">Sensitive-Data Classification</h1>
        <p className="m-0 text-[13px] text-muted">
          Real Presidio pattern recognizers for PAN, Aadhaar, IFSC, GSTIN and common PII.
          Paste/upload proof-of-detection endpoint — not yet wired to a live document source
          (SharePoint/Drive), so this scans whatever text you paste in, not an automated document
          scanner.
        </p>
      </div>

      <div className="glass glass-hover rounded-xl p-5">
        <div className="mb-3.5 flex flex-col items-start gap-2.5">
          <label htmlFor="classifyText" className="text-[13px] font-semibold text-text">
            Text to scan
          </label>
          <textarea
            id="classifyText"
            rows={6}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste sample text containing e.g. a PAN, Aadhaar, IFSC, or GSTIN number…"
            className="glass w-full resize-y rounded-lg px-3 py-2.5 text-[13px] text-text placeholder:text-faint transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
        </div>
        <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
          <label htmlFor="classifyLabel" className="text-[13px] font-semibold text-text">
            Label (optional):
          </label>
          <input
            id="classifyLabel"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. HR offer letter"
            className="glass rounded-lg px-3 py-2 text-[13px] text-text placeholder:text-faint transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
          <button
            onClick={runClassify}
            disabled={busy}
            className="rounded-lg bg-gradient-to-b from-accent to-accent-dark px-4 py-2.25 text-[13px] font-semibold text-[#03151a] transition-all duration-150 hover:-translate-y-0.5 hover:shadow-accent-glow active:translate-y-0 disabled:translate-y-0 disabled:bg-tint/10 disabled:bg-none disabled:text-faint disabled:shadow-none"
          >
            {busy ? "Classifying…" : "Classify"}
          </button>
        </div>

        {resultError && (
          <div className="rounded-lg border border-dashed border-border bg-tint/[0.02] p-2.5 px-3.5 text-[12.5px] text-muted">
            {resultError}
          </div>
        )}
        {result && <ClassifyResultCard result={result} />}
      </div>

      <div className="mb-3 mt-7 text-[13px] font-bold uppercase tracking-wide text-muted">Recent Scans</div>
      <div className="glass glass-hover overflow-hidden rounded-xl">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {["Time", "Label", "Entities Found", "Sensitivity", "Snippet"].map((h) => (
                <th key={h} className="border-b border-border bg-tint/[0.02] px-3.5 py-2.75 text-left text-[10.5px] font-bold uppercase tracking-wide text-muted">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {historyUnavailable ? (
              <EmptyRow>Classification unavailable on this deployment (presidio-analyzer not installed).</EmptyRow>
            ) : historyError ? (
              <EmptyRow>Could not reach API.</EmptyRow>
            ) : history === null ? (
              <EmptyRow>Loading…</EmptyRow>
            ) : history.length === 0 ? (
              <EmptyRow>No scans yet — classify some text above.</EmptyRow>
            ) : (
              paged.map((s) => {
                const total = Object.values(s.entity_counts || {}).reduce((a, b) => a + b, 0);
                const level = sensitivityLevel(s.sensitivity_score);
                return (
                  <tr key={s.id} className="transition-colors hover:bg-tint/[0.03]">
                    <Td>{formatTimestamp(s.timestamp)}</Td>
                    <Td>{s.label || "—"}</Td>
                    <Td>
                      {total} entit{total === 1 ? "y" : "ies"}
                    </Td>
                    <td className="border-b border-border px-3.5 py-2.75 text-[13px]">
                      <RiskBadge level={level} />
                      <span className="ml-1">{s.sensitivity_score}</span>
                    </td>
                    <Td>{s.snippet || ""}</Td>
                  </tr>
                );
              })
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

function ClassifyResultCard({ result }: { result: ClassifyResult }) {
  const level = sensitivityLevel(result.sensitivity_score);
  const entries = Object.entries(result.entity_counts || {});
  const exampleEntries = Object.entries(result.examples || {});

  return (
    <div className="glass mt-3.5 rounded-xl p-5">
      <div className={`font-mono text-[28px] font-semibold tabular-nums ${LEVEL_TEXT_CLASS[level]}`}>
        {result.sensitivity_score}
        <span className="text-[14px] font-semibold text-muted"> / 100 — {level}</span>
      </div>
      <div className="mt-2.5">
        {entries.length === 0 ? (
          <span className="text-muted">No sensitive entities detected.</span>
        ) : (
          entries.map(([k, v]) => (
            <span key={k} className="mr-1.5 mb-0.5 inline-block rounded-md bg-accent-light px-2.5 py-0.75 text-[12px] font-bold text-accent">
              {k}: {v}
            </span>
          ))
        )}
      </div>
      {exampleEntries.length > 0 && (
        <div className="mt-2">
          <strong className="text-[12px] text-text">Examples (masked):</strong>
          {exampleEntries.flatMap(([entityType, items]) =>
            (items || []).map((it, i) => (
              <div key={`${entityType}-${i}`} className="mt-1 text-[12.5px] text-muted">
                {entityType}: <strong className="text-text">{it.masked_value}</strong> (confidence{" "}
                {Math.round((it.confidence || 0) * 100)}%)
              </div>
            )),
          )}
        </div>
      )}
    </div>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="border-b border-border px-3.5 py-2.75 text-[13px] text-text">{children}</td>;
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={5} className="p-10 text-center text-muted">
        {children}
      </td>
    </tr>
  );
}
