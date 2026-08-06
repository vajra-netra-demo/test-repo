import { LogOut } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";

// Sits beside ThemeToggle in the top-of-screen header (App.tsx) — the
// signed-in username, their role (admin actions are gated on this
// elsewhere: Run Live Scan, Remediate, Auto-Revoke, offboarding), and a
// logout button.
export function UserMenu() {
  const { session, logout } = useAuth();
  if (!session) return null;

  return (
    <div className="glass flex items-center gap-2.5 rounded-full px-3 py-1.5 text-[12px] font-semibold text-muted">
      <span className="text-text">{session.username}</span>
      <span
        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
          session.role === "admin" ? "bg-accent-light text-accent" : "bg-tint/[0.08] text-muted"
        }`}
      >
        {session.role}
      </span>
      <button
        onClick={logout}
        title="Sign out"
        className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-muted transition-colors hover:text-high"
      >
        <LogOut size={13} strokeWidth={2.25} />
      </button>
    </div>
  );
}
