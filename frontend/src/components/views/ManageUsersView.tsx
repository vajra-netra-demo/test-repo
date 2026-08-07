import { useEffect, useState } from "react";
import { Trash2, UserPlus } from "lucide-react";
import { api, ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";
import { useToast } from "../Toaster";
import { Dropdown } from "../Dropdown";
import { PasswordInput } from "../PasswordInput";
import { Pagination } from "../Pagination";
import { usePagination } from "../../hooks/usePagination";
import type { AppUser, UserRole } from "../../types";

const ROLE_OPTIONS = [
  { value: "viewer", label: "viewer" },
  { value: "admin", label: "admin" },
];

// Admin-only (App.tsx only routes here for an admin; the backend enforces
// the same via require_admin on every /auth/users route regardless). No
// public self-registration exists in this tool — accounts are provisioned
// here, deliberately, since an account can trigger live scans and revoke
// real GitHub access.
export function ManageUsersView() {
  const { session } = useAuth();
  const { showToast } = useToast();
  const [users, setUsers] = useState<AppUser[] | null>(null);
  const [error, setError] = useState(false);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("viewer");
  const [creating, setCreating] = useState(false);
  const [deletingUser, setDeletingUser] = useState<string | null>(null);
  const { page, setPage, pageSize, setPageSize, pageCount, paged, totalRows } = usePagination(users ?? []);

  async function load() {
    try {
      setUsers(await api.listUsers());
      setError(false);
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      showToast("Enter a username and password.", "error");
      return;
    }
    setCreating(true);
    try {
      await api.createUser(username.trim(), password, role);
      showToast(`Account "${username.trim()}" created.`, "success");
      setUsername("");
      setPassword("");
      setRole("viewer");
      await load();
    } catch (e) {
      const message = e instanceof ApiError ? e.message : String(e);
      showToast(`Could not create account: ${message}`, "error");
    } finally {
      setCreating(false);
    }
  }

  async function onDelete(target: string) {
    if (!window.confirm(`Delete the account "${target}"? This can't be undone.`)) return;
    setDeletingUser(target);
    try {
      await api.deleteUser(target);
      showToast(`Account "${target}" deleted.`, "success");
      await load();
    } catch (e) {
      const message = e instanceof ApiError ? e.message : String(e);
      showToast(`Could not delete account: ${message}`, "error");
    } finally {
      setDeletingUser(null);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="mb-0.5 text-[21px] font-semibold text-text">Manage Users</h1>
        <p className="m-0 text-[13px] text-muted">
          Accounts that can sign in to NETRA. No public sign-up — every account here is
          provisioned by an admin, since an account can trigger live scans and revoke real
          access.
        </p>
      </div>

      <div className="glass glass-hover mb-6 rounded-xl p-5">
        <h3 className="mb-3.5 text-[13px] font-bold uppercase tracking-wide text-muted">Create account</h3>
        <form onSubmit={onCreate} className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="newUsername" className="mb-1.5 block text-[12.5px] font-semibold text-text">
              Username
            </label>
            <input
              id="newUsername"
              name="new-account-username"
              type="text"
              autoComplete="off"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="glass w-[180px] rounded-lg px-3 py-2 text-[13px] text-text placeholder:text-faint transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              placeholder="e.g. jane"
            />
          </div>
          <div>
            <label htmlFor="newPassword" className="mb-1.5 block text-[12.5px] font-semibold text-text">
              Password
            </label>
            <PasswordInput
              id="newPassword"
              name="new-account-password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="glass w-[180px] rounded-lg px-3 py-2 text-[13px] text-text placeholder:text-faint transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              placeholder="••••••••"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[12.5px] font-semibold text-text">Role</label>
            <Dropdown
              value={role}
              onChange={(v) => setRole(v as UserRole)}
              options={ROLE_OPTIONS}
              minWidth={120}
            />
          </div>
          <button
            type="submit"
            disabled={creating}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-accent to-accent-dark px-4 py-2 text-[13px] font-semibold text-[#03151a] transition-all duration-150 hover:-translate-y-0.5 hover:shadow-accent-glow active:translate-y-0 disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-tint/10 disabled:bg-none disabled:text-faint disabled:shadow-none"
          >
            <UserPlus size={14} strokeWidth={2.25} /> {creating ? "Creating…" : "Create"}
          </button>
        </form>
      </div>

      <div className="glass glass-hover overflow-hidden rounded-xl">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {["Username", "Role", ""].map((h) => (
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
            ) : users === null ? (
              <EmptyRow>Loading…</EmptyRow>
            ) : (
              paged.map((u) => {
                const isSelf = u.username === session?.username;
                return (
                  <tr key={u.username} className="transition-colors hover:bg-tint/[0.03]">
                    <td className="border-b border-border px-3.5 py-2.75 text-[13px] text-text">
                      {u.username}
                      {isSelf && <span className="ml-1.75 text-[11px] text-muted">(you)</span>}
                    </td>
                    <td className="border-b border-border px-3.5 py-2.75 text-[13px]">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          u.role === "admin" ? "bg-accent-light text-accent" : "bg-tint/[0.08] text-muted"
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="border-b border-border px-3.5 py-2.75 text-right text-[13px]">
                      <button
                        onClick={() => onDelete(u.username)}
                        disabled={isSelf || deletingUser === u.username}
                        title={isSelf ? "You can't delete your own account while signed in as it" : "Delete account"}
                        className="inline-flex items-center gap-1.5 rounded-md border border-high/30 bg-high-bg px-2.5 py-1 text-[11.5px] font-semibold text-high-dark transition-all duration-150 hover:-translate-y-0.5 hover:bg-high hover:text-white disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:bg-high-bg disabled:hover:text-high-dark"
                      >
                        <Trash2 size={12} strokeWidth={2.25} /> Delete
                      </button>
                    </td>
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

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={3} className="p-10 text-center text-muted">
        {children}
      </td>
    </tr>
  );
}
