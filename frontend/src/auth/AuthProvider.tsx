import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, getAuthToken, setAuthToken, setUnauthorizedHandler } from "../api/client";
import type { UserRole } from "../types";

interface Session {
  username: string;
  role: UserRole;
}

interface AuthApi {
  session: Session | null;
  isAdmin: boolean;
  // Undefined while the initial /auth/me check (session restore on reload)
  // is still in flight — lets App.tsx show a blank/loading beat instead of
  // flashing the login screen for a user who actually has a valid token.
  checking: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // A 401 from ANY call (not just ones this provider makes) means the
    // token is gone/expired — drop the session so App.tsx falls back to
    // the login screen, matching Dev's original "bounce back to login on
    // any 401" behavior.
    setUnauthorizedHandler(() => setSession(null));
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    if (!getAuthToken()) {
      setChecking(false);
      return;
    }
    // Restore the session on reload by validating the stored token rather
    // than trusting it blindly — an expired/revoked token should still
    // bounce to login instead of showing a broken dashboard.
    api
      .me()
      .then((res) => setSession({ username: res.username, role: res.role }))
      .catch(() => setAuthToken(null))
      .finally(() => setChecking(false));
  }, []);

  async function login(username: string, password: string) {
    const res = await api.login(username, password);
    setAuthToken(res.access_token);
    setSession({ username: res.username, role: res.role });
  }

  function logout() {
    setAuthToken(null);
    setSession(null);
  }

  return (
    <AuthContext.Provider value={{ session, isAdmin: session?.role === "admin", checking, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
