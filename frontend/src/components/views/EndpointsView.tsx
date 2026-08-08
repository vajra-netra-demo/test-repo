import { useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";
import { RiskBadge } from "../Badge";
import { Pagination } from "../Pagination";
import { usePagination } from "../../hooks/usePagination";
import { riskLevel } from "../../lib/risk";
import type { EndpointDevice, SaaSTool } from "../../types";
import { formatTimestamp } from "../../lib/datetime";

const TRIAGE_CLASSES: Record<string, string> = {
  "auto-fix": "bg-high-bg text-high-dark ring-1 ring-inset ring-high/30",
  "manual-review": "bg-med-bg text-med-dark ring-1 ring-inset ring-med/30",
  ignore: "bg-tint/[0.06] text-muted",
};

export function EndpointsView() {
  const [devices, setDevices] = useState<EndpointDevice[] | null>(null);
  const [tools, setTools] = useState<SaaSTool[]>([]);
  const [findingCounts, setFindingCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<EndpointDevice | null>(null);
  const { page, setPage, pageSize, setPageSize, pageCount, paged, totalRows } = usePagination(devices ?? []);

  const selectedFindings = useMemo(
    () => (selected ? tools.filter((t) => t.source === "endpoint" && t.endpoint_device_id === selected.id) : []),
    [selected, tools],
  );
  const findingsPagination = usePagination(selectedFindings);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [deviceList, toolList] = await Promise.all([api.getEndpoints(), api.getTools()]);
        if (cancelled) return;
        const counts: Record<string, number> = {};
        toolList.forEach((t) => {
          if (t.source === "endpoint" && t.endpoint_device_id) {
            counts[t.endpoint_device_id] = (counts[t.endpoint_device_id] || 0) + 1;
          }
        });
        setDevices(deviceList);
        setTools(toolList);
        setFindingCounts(counts);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function selectDevice(device: EndpointDevice) {
    setSelected(device);
    findingsPagination.setPage(1);
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="mb-0.5 text-[21px] font-semibold text-text">Endpoint Devices</h1>
        <p className="m-0 text-[13px] text-muted">
          Devices reporting via the TriNetra endpoint agent — reads real browser extensions and
          installed software, catching what OAuth-based discovery structurally can't see (see
          agent/README.md to enroll a machine)
        </p>
      </div>
      <div className="glass glass-hover overflow-hidden rounded-xl">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {["Hostname", "OS", "Employee", "Department", "First Check-in", "Last Check-in", "Agent Version", "Findings"].map(
                (h) => (
                  <th key={h} className="border-b border-border bg-tint/[0.02] px-3.5 py-2.75 text-left text-[10.5px] font-bold uppercase tracking-wide text-muted">
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {error ? (
              <EmptyRow>Could not reach API.</EmptyRow>
            ) : devices === null ? (
              <EmptyRow>Loading…</EmptyRow>
            ) : devices.length === 0 ? (
              <EmptyRow>
                No devices have checked in yet — run agent/netra_agent.py on a machine to enroll it. See
                agent/README.md.
              </EmptyRow>
            ) : (
              paged.map((d) => (
                <tr
                  key={d.id}
                  onClick={() => selectDevice(d)}
                  className={`cursor-pointer transition-colors hover:bg-accent-light/60 ${
                    selected?.id === d.id ? "bg-accent-light/60" : ""
                  }`}
                >
                  <Td>{d.hostname}</Td>
                  <Td>{d.os}</Td>
                  <Td>{d.employee || "—"}</Td>
                  <Td>{d.department || "—"}</Td>
                  <Td>{formatTimestamp(d.first_checkin)}</Td>
                  <Td>{formatTimestamp(d.last_checkin)}</Td>
                  <Td>{d.agent_version || "—"}</Td>
                  <Td>{findingCounts[d.id] || 0}</Td>
                </tr>
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

      {selected && (
        <div className="animate-view-fade mt-7">
          <div className="mb-3 text-[13px] font-bold uppercase tracking-wide text-muted">
            Tools &amp; Findings on {selected.hostname}
          </div>
          <div className="glass rounded-xl overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["Tool", "Risk", "Score", "Flags", "Triage Agent"].map((h) => (
                    <th
                      key={h}
                      className="border-b border-border bg-tint/[0.02] px-3.5 py-2.75 text-left text-[10.5px] font-bold uppercase tracking-wide text-muted"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedFindings.length === 0 ? (
                  <EmptyRow colSpan={5}>No findings on this device.</EmptyRow>
                ) : (
                  findingsPagination.paged.map((t) => {
                    const level = riskLevel(t.risk_score);
                    return (
                      <tr key={t.id} className="transition-colors hover:bg-tint/[0.03]">
                        <Td>{t.tool_name}</Td>
                        <td className="border-b border-border px-3.5 py-2.75 text-[13px]">
                          {level ? <RiskBadge level={level} /> : "—"}
                        </td>
                        <Td className="font-mono">{t.risk_score ?? "—"}</Td>
                        <td className="border-b border-border px-3.5 py-2.75 text-[13px]">
                          {t.risk_flags && t.risk_flags.length > 0
                            ? t.risk_flags.map((f) => (
                                <span
                                  key={f}
                                  className="mr-1 mb-0.5 inline-block rounded bg-tint/[0.06] px-2 py-0.5 text-[11px] font-semibold text-text"
                                >
                                  {f}
                                </span>
                              ))
                            : "—"}
                        </td>
                        <td className="border-b border-border px-3.5 py-2.75 text-[13px]">
                          {t.triage_decision ? (
                            <span
                              className={`inline-block rounded px-2.5 py-0.75 text-[11px] font-bold ${TRIAGE_CLASSES[t.triage_decision] ?? ""}`}
                            >
                              {t.triage_decision}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            <Pagination
              page={findingsPagination.page}
              pageCount={findingsPagination.pageCount}
              pageSize={findingsPagination.pageSize}
              totalRows={findingsPagination.totalRows}
              onPageChange={findingsPagination.setPage}
              onPageSizeChange={findingsPagination.setPageSize}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={`border-b border-border px-3.5 py-2.75 text-[13px] text-text ${className ?? ""}`}>{children}</td>
  );
}

function EmptyRow({ children, colSpan = 8 }: { children: React.ReactNode; colSpan?: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="p-10 text-center text-muted">
        {children}
      </td>
    </tr>
  );
}
