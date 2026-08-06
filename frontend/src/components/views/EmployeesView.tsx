import { useEffect, useState } from "react";
import { ShieldOff, Undo2 } from "lucide-react";
import { api, ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { useToast } from "../Toaster";
import { RiskBadge } from "../Badge";
import { riskLevel } from "../../lib/risk";
import type { EmployeeProfile, EmployeeSummary } from "../../types";

const TRIAGE_CLASSES: Record<string, string> = {
  "auto-fix": "bg-high-bg text-high-dark ring-1 ring-inset ring-high/30",
  "manual-review": "bg-med-bg text-med-dark ring-1 ring-inset ring-med/30",
  ignore: "bg-tint/[0.06] text-muted",
};

// Per-employee drill-down + offboarding review — ported from the feature
// that shipped in Dev's old static/index.html (never in this React app
// until now). There's no separate employee directory backing this: rows
// come entirely from EndpointDevice.employee, the only place a real
// person's name exists in this data model (OAuth/live/sample tools only
// ever carry a role, e.g. "HR Executive").
export function EmployeesView() {
  const { showToast } = useToast();
  const { isAdmin } = useAuth();
  const [employees, setEmployees] = useState<EmployeeSummary[] | null>(null);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [profileError, setProfileError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function loadEmployees() {
    try {
      setEmployees(await api.getEmployees());
      setError(false);
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    loadEmployees();
  }, []);

  async function selectEmployee(employee: string) {
    setSelected(employee);
    setProfile(null);
    setProfileError(false);
    try {
      setProfile(await api.getEmployeeProfile(employee));
    } catch {
      setProfileError(true);
    }
  }

  async function onOffboard() {
    if (!selected) return;
    const confirmed = window.confirm(
      `Mark "${selected}" as offboarded? This flags every tool found on their device(s) as High risk, ` +
        `pending manual access revocation. This does not auto-revoke anything.`,
    );
    if (!confirmed) return;
    setBusy(true);
    try {
      await api.offboardEmployee(selected);
      showToast(`${selected} marked offboarded — their tools are now flagged for review.`, "success");
      await Promise.all([selectEmployee(selected), loadEmployees()]);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : String(e);
      showToast(`Could not mark offboarded: ${message}`, "error");
    } finally {
      setBusy(false);
    }
  }

  async function onUndoOffboard() {
    if (!selected) return;
    setBusy(true);
    try {
      await api.undoOffboardEmployee(selected);
      showToast(`${selected}'s offboarded status undone.`, "success");
      await Promise.all([selectEmployee(selected), loadEmployees()]);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : String(e);
      showToast(`Could not undo offboarding: ${message}`, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="mb-0.5 text-[21px] font-semibold text-text">Employees</h1>
        <p className="m-0 text-[13px] text-muted">
          Per-employee drill-down, derived from endpoint-agent check-ins — click a row to see
          everything discovered on that person's device(s), and mark them offboarded if they've
          departed.
        </p>
      </div>

      <div className="glass glass-hover rounded-xl p-5">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {["Employee", "Department", "Devices", "Tools Found", "High Risk", "Status"].map((h) => (
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
            {error ? (
              <EmptyRow>Could not reach API.</EmptyRow>
            ) : employees === null ? (
              <EmptyRow>Loading…</EmptyRow>
            ) : employees.length === 0 ? (
              <EmptyRow>
                No employees found yet — run agent/netra_agent.py on a machine to enroll it.
              </EmptyRow>
            ) : (
              employees.map((e) => (
                <tr
                  key={e.employee}
                  onClick={() => selectEmployee(e.employee)}
                  className={`cursor-pointer transition-colors hover:bg-accent-light/60 ${
                    selected === e.employee ? "bg-accent-light/60" : ""
                  }`}
                >
                  <Td className="font-semibold">{e.employee}</Td>
                  <Td>{e.department || "—"}</Td>
                  <Td>{e.device_count}</Td>
                  <Td>{e.tool_count}</Td>
                  <td className="border-b border-border px-3.5 py-2.75 text-[13px]">
                    {e.high_risk_count > 0 ? <RiskBadge level="High" /> : <span className="text-text">0</span>}
                  </td>
                  <td className="border-b border-border px-3.5 py-2.75 text-[13px]">
                    {e.offboarded ? (
                      <span className="rounded bg-high-bg px-1.75 py-0.5 text-[9.5px] font-bold uppercase text-high-dark">
                        Offboarded {e.offboarded_date ? e.offboarded_date.slice(0, 10) : ""}
                      </span>
                    ) : (
                      <span className="text-text">Active</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="animate-view-fade mt-7">
          <div className="mb-3 text-[13px] font-bold uppercase tracking-wide text-muted">
            Employee Profile — {selected}
          </div>
          <div className="glass rounded-xl p-5">
            {profileError ? (
              <div className="text-[13px] text-muted">Could not reach API.</div>
            ) : !profile ? (
              <div className="text-[13px] text-muted">Loading…</div>
            ) : (
              <>
                <div className="text-[13px] text-text">
                  <strong>Devices:</strong>{" "}
                  {profile.devices.map((d) => `${d.hostname} (${d.os}, last check-in ${d.last_checkin})`).join(", ") ||
                    "—"}
                </div>
                {profile.offboarded && (
                  <div className="mt-2.5 rounded-lg border border-dashed border-border bg-tint/[0.03] px-3.5 py-2.5 text-[12.5px] text-muted">
                    Marked offboarded on {(profile.offboarded_date || "").slice(0, 10)}
                    {profile.offboard_note ? ` — ${profile.offboard_note}` : ""}. All their tools below have
                    been flagged for access-revocation review.
                  </div>
                )}
                {isAdmin &&
                  (profile.offboarded ? (
                    <button
                      onClick={onUndoOffboard}
                      disabled={busy}
                      className="glass glass-hover mt-3 inline-flex items-center gap-1.5 rounded-md px-3 py-1.25 text-[12px] font-semibold text-text transition-all duration-150 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Undo2 size={13} strokeWidth={2.25} /> Undo Offboard
                    </button>
                  ) : (
                    <button
                      onClick={onOffboard}
                      disabled={busy}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-high/30 bg-high-bg px-3 py-1.25 text-[12px] font-semibold text-high-dark transition-all duration-150 hover:-translate-y-0.5 hover:bg-high hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <ShieldOff size={13} strokeWidth={2.25} /> Mark as Offboarded — Flag Access for Review
                    </button>
                  ))}
              </>
            )}
          </div>

          <div className="mb-3 mt-7 text-[13px] font-bold uppercase tracking-wide text-muted">
            Tools &amp; Findings on Their Device(s)
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
                {!profile || profile.tools.length === 0 ? (
                  <EmptyRow colSpan={5}>
                    {profile ? "No tools found on this employee's device(s)." : "Loading…"}
                  </EmptyRow>
                ) : (
                  profile.tools.map((t) => {
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

function EmptyRow({ children, colSpan = 6 }: { children: React.ReactNode; colSpan?: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="p-10 text-center text-muted">
        {children}
      </td>
    </tr>
  );
}
