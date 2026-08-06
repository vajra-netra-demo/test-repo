import { useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { ToastProvider } from "./components/Toaster";
import { ThemeToggle } from "./components/ThemeToggle";
import { ThemeProvider } from "./theme/ThemeProvider";
import { DashboardView } from "./components/views/DashboardView";
import { EndpointsView } from "./components/views/EndpointsView";
import { ClassifyView } from "./components/views/ClassifyView";
import { RegulationView } from "./components/views/RegulationView";
import type { ViewKey } from "./types/view";

// Each view mounts fresh (rather than staying mounted with CSS display:none,
// like the original's .view/.view.active classes) — the endpoints/classify
// views re-fetch on every visit, matching the original's loadEndpoints()/
// loadClassifyHistory() calls on nav-item click. The dashboard keeps its
// live-scan poll interval running only while mounted, i.e. only while active,
// which is the one behavioral trade-off worth knowing about (see explanation
// in chat) — switch away mid-scan and the toast on completion won't fire
// until you switch back.
export default function App() {
  const [view, setView] = useState<ViewKey>("dashboard");

  return (
    <ThemeProvider>
      <ToastProvider>
        <div className="app-canvas flex min-h-screen bg-bg">
          <Sidebar active={view} onSelect={setView} />
          <div className="min-w-0 flex-1">
            {/* Persistent header — stays at the top of the screen across
                every view (and while scrolling), rather than living at the
                bottom of the sidebar where it's easy to miss. */}
            <div className="sticky top-0 z-10 flex justify-end bg-bg/80 px-9 py-3 backdrop-blur-sm">
              <ThemeToggle />
            </div>
            {/* pt-6 gives real clearance below the sticky bar above — without
                it, page content (e.g. the topbar buttons) starts flush
                against the sticky bar's bottom edge, so any hover effect
                that shifts content upward (hover:-translate-y-*) tucks a
                sliver of it behind the sticky bar's higher z-index. */}
            <div className="px-9 pb-7 pt-6">
              <div key={view} className="mx-auto max-w-[1180px] animate-view-fade">
                {view === "dashboard" && <DashboardView />}
                {view === "endpoints" && <EndpointsView />}
                {view === "classify" && <ClassifyView />}
                {view === "regulation" && <RegulationView />}
              </div>
            </div>
          </div>
        </div>
      </ToastProvider>
    </ThemeProvider>
  );
}
