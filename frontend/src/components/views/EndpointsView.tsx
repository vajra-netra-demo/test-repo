import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { EndpointDevice } from "../../types";

export function EndpointsView() {
  const [devices, setDevices] = useState<EndpointDevice[] | null>(null);
  const [findingCounts, setFindingCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [deviceList, tools] = await Promise.all([api.getEndpoints(), api.getTools()]);
        if (cancelled) return;
        const counts: Record<string, number> = {};
        tools.forEach((t) => {
          if (t.source === "endpoint" && t.endpoint_device_id) {
            counts[t.endpoint_device_id] = (counts[t.endpoint_device_id] || 0) + 1;
          }
        });
        setDevices(deviceList);
        setFindingCounts(counts);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="mb-0.5 text-[21px] font-semibold text-text">Endpoint Devices</h1>
        <p className="m-0 text-[13px] text-muted">
          Devices reporting via the NETRA endpoint agent — reads real browser extensions and
          installed software, catching what OAuth-based discovery structurally can't see (see
          agent/README.md to enroll a machine)
        </p>
      </div>
      <div className="glass glass-hover rounded-xl p-5">
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
              devices.map((d) => (
                <tr key={d.id} className="transition-colors hover:bg-tint/[0.03]">
                  <Td>{d.hostname}</Td>
                  <Td>{d.os}</Td>
                  <Td>{d.employee || "—"}</Td>
                  <Td>{d.department || "—"}</Td>
                  <Td>{d.first_checkin}</Td>
                  <Td>{d.last_checkin}</Td>
                  <Td>{d.agent_version || "—"}</Td>
                  <Td>{findingCounts[d.id] || 0}</Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="border-b border-border px-3.5 py-2.75 text-[13px] text-text">{children}</td>;
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={8} className="p-10 text-center text-muted">
        {children}
      </td>
    </tr>
  );
}
