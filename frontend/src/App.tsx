import { useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { ToastProvider } from "./components/Toaster";
import { ThemeToggle } from "./components/ThemeToggle";
import { ThemeProvider } from "./theme/ThemeProvider";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { LoginView } from "./components/views/LoginView";
import { DashboardView } from "./components/views/DashboardView";
import { EndpointsView } from "./components/views/EndpointsView";
import { EmployeesView } from "./components/views/EmployeesView";
import { ClassifyView } from "./components/views/ClassifyView";
import { RegulationView } from "./components/views/RegulationView";
import { ManageUsersView } from "./components/views/ManageUsersView";
import type { ViewKey } from "./types/view";

// Each view mounts fresh (rather than staying mounted with CSS display:none,
// like the original's .view/.view.active classes) — the endpoints/classify
// views re-fetch on every visit, matching the original's loadEndpoints()/
// loadClassifyHistory() calls on nav-item click. The dashboard keeps its
// live-scan poll interval running only while mounted, i.e. only while active,
// which is the one behavioral trade-off worth knowing about (see explanation
// in chat) — switch away mid-scan and the toast on completion won't fire
// until you switch back.
function AppShell() {
  const [view, setView] = useState<ViewKey>("dashboard");
  const { session, checking, isAdmin } = useAuth();

  // Restoring a session (validating a stored token via /auth/me) is quick
  // but not instant — a blank canvas beats a login-screen flash for anyone
  // who's actually already signed in.
  if (checking) {
    return <div className="app-canvas min-h-screen bg-bg" />;
  }
  if (!session) {
    return <LoginView />;
  }

  return (
    // h-screen + overflow-hidden on the shell, with only the content pane
    // below scrolling — the sidebar is a sibling flex item, not sticky/
    // fixed itself, so it never moves: it simply never gets a scrollbar
    // because it's exactly viewport-height. (It used to be min-h-screen,
    // which let the whole page grow taller than the viewport and scrolled
    // the sidebar away along with everything else.)
    <div className="app-canvas flex h-screen overflow-hidden bg-bg">
      <Sidebar active={view} onSelect={setView} />
      <div className="h-full min-w-0 flex-1 overflow-y-auto">
        {/* Persistent header — stays at the top of the screen across
            every view (and while scrolling), rather than living at the
            bottom of the sidebar where it's easy to miss. Kept as thin as
            the toggle itself needs (py-1.5, not the old py-3) — this row's
            only job is holding one small control, so it shouldn't push
            every page's actual content down by more than that. */}
        <div className="sticky top-0 z-10 flex items-center justify-end gap-2.5 bg-bg/80 px-9 py-1.5 backdrop-blur-sm">
          <ThemeToggle />
        </div>
        {/* Small clearance below the sticky bar above — enough that a
            hover effect shifting content upward (hover:-translate-y-*,
            typically 2px) doesn't tuck a sliver behind the sticky bar's
            higher z-index, without the old pt-6's much larger gap. */}
        <div className="px-9 pb-7 pt-2.5">
          <div key={view} className="mx-auto max-w-[1180px] animate-view-fade">
            {view === "dashboard" && <DashboardView />}
            {view === "endpoints" && <EndpointsView />}
            {view === "employees" && <EmployeesView />}
            {view === "classify" && <ClassifyView />}
            {view === "regulation" && <RegulationView />}
            {/* isAdmin re-checked here too, not just in Sidebar's nav-item
                filter — the backend enforces this regardless, but a viewer
                should never even see the view mount, not just lose the
                nav link to it. */}
            {view === "users" && isAdmin && <ManageUsersView />}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <AppShell />
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
