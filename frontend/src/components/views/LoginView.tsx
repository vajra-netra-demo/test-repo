import { useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { ApiError } from "../../api/client";
import { PasswordInput } from "../PasswordInput";

export function LoginView() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("Enter a username and password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Login failed — could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-canvas flex min-h-screen items-center justify-center bg-bg px-6">
      <div className="glass w-full max-w-[400px] rounded-2xl p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-dark text-[16px] font-extrabold text-[#03151a] shadow-accent-glow">
            N
          </div>
          <div>
            <div className="text-[18px] font-extrabold tracking-wide text-text">TriNetra</div>
            <div className="text-[11px] text-muted">Privacy & Shadow-IT Discovery</div>
          </div>
        </div>

        <h1 className="mb-1 text-[19px] font-semibold text-text">Sign in</h1>
        <p className="mb-5 text-[13px] text-muted">Use your TriNetra account to view or manage discovery.</p>

        <form onSubmit={onSubmit} className="space-y-3.5">
          <div>
            <label htmlFor="username" className="mb-1.5 block text-[12.5px] font-semibold text-text">
              Username
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="glass w-full rounded-lg px-3.5 py-2.5 text-[13px] text-text placeholder:text-faint transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              placeholder="admin"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-[12.5px] font-semibold text-text">
              Password
            </label>
            <PasswordInput
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="glass w-full rounded-lg px-3.5 py-2.5 text-[13px] text-text placeholder:text-faint transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              placeholder="Enter your password"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-high/30 bg-high-bg px-3.5 py-2.5 text-[12.5px] text-high-dark">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-gradient-to-b from-accent to-accent-dark px-4 py-2.5 text-[13px] font-semibold text-[#03151a] transition-all duration-150 hover:-translate-y-0.5 hover:shadow-accent-glow active:translate-y-0 disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-tint/10 disabled:bg-none disabled:text-faint disabled:shadow-none"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
