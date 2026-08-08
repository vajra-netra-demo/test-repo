import {
  ChevronLeft,
  ChevronRight,
  Contact,
  LayoutDashboard,
  LogOut,
  MonitorSmartphone,
  ScanSearch,
  Scale,
  Users,
} from "lucide-react";
import { useState, type ComponentType } from "react";
import { useAuth } from "../auth/AuthProvider";
import type { ViewKey } from "../types/view";
import trinetraLogo from "../assets/trinetra-logo.png";

const NAV_ITEMS: Array<{ key: ViewKey; label: string; icon: ComponentType<{ size?: number; strokeWidth?: number }>; adminOnly?: boolean }> = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "endpoints", label: "Endpoint Devices", icon: MonitorSmartphone },
  { key: "employees", label: "Employees", icon: Contact },
  { key: "classify", label: "Classify Text", icon: ScanSearch },
  { key: "regulation", label: "Regulation Search", icon: Scale },
  { key: "users", label: "Manage Users", icon: Users, adminOnly: true },
];

interface SidebarProps {
  active: ViewKey;
  onSelect: (view: ViewKey) => void;
}

// The sidebar is fixed "branded chrome" — it stays the same dark navy in
// both themes (see the --color-sidebar-* tokens in index.css), so every
// piece of text/accent in here uses those *-sidebar-* tokens, never the
// page's theme-flipping text-*/muted/accent utilities. Using the latter by
// mistake is exactly how TriNetra's wordmark went dark-text-on-dark-sidebar
// illegible the first time this shipped with light mode.
export function Sidebar({ active, onSelect }: SidebarProps) {
  const { session, isAdmin, logout } = useAuth();
  const items = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);
  const [collapsed, setCollapsed] = useState(false);
  const initial = session?.username?.[0]?.toUpperCase() ?? "?";

  return (
    // h-full (not min-h-screen) — App.tsx now makes the outer shell exactly
    // h-screen with the *content* pane scrolling internally, so the sidebar
    // fills that fixed height rather than growing with the page and
    // scrolling away with it.
    <div
      // z-20 (explicit, not just `relative`) — without it, this div has no
      // z-index of its own, so the collapse handle's z-10 never actually
      // gets compared against DashboardView's sticky top-of-screen header
      // (also z-10): position:relative alone doesn't open a stacking
      // context, so the button's z-index bubbles all the way up to the
      // root, ties with the header's z-10, and loses the tie-break (the
      // header comes later in DOM order) — the handle rendered as a faint
      // ring behind the header's blurred glass instead of a solid button.
      className={`relative z-20 flex h-full shrink-0 flex-col bg-gradient-to-b from-sidebar to-sidebar-end py-6 transition-[width] duration-200 ${
        collapsed ? "w-[76px]" : "w-[240px]"
      }`}
    >
      {/* Signature edge — a thin cyan seam separating the sidebar from the
          canvas, the one deliberate "brand line" in the whole UI. */}
      <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-sidebar-accent/40 via-sidebar-accent/10 to-transparent" />

      {/* Collapse/expand handle — half-overlapping the seam above, the
          usual place users look for a sidebar toggle. */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute -right-3 top-8 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-sidebar-border bg-sidebar text-sidebar-muted shadow-accent-glow transition-colors hover:text-sidebar-accent"
      >
        {collapsed ? <ChevronRight size={13} strokeWidth={2.5} /> : <ChevronLeft size={13} strokeWidth={2.5} />}
      </button>

      <div className={`flex items-center gap-3 border-b border-sidebar-border px-6 pb-6 ${collapsed ? "justify-center px-0" : ""}`}>
        <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg shadow-accent-glow">
          {/* Source is a full square poster (eye emblem + wordmark + tagline
              baked in, see frontend/src/assets/trinetra-logo.png) — oversized
              and cropped to just the eye emblem here since the full poster's
              text is illegible at nav-icon size. */}
          <img
            src={trinetraLogo}
            alt="TriNetra"
            className="absolute left-1/2 top-[-26%] h-[200%] w-[200%] max-w-none -translate-x-1/2 object-cover"
          />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="text-[17px] font-extrabold tracking-wide text-sidebar-text">TriNetra</div>
            <div className="text-[10.5px] leading-snug text-sidebar-muted">Privacy & Shadow-IT Discovery</div>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3 pt-4">
        {items.map((item) => {
          const isActive = active === item.key;
          const Icon = item.icon;
          return (
            <div
              key={item.key}
              onClick={() => onSelect(item.key)}
              title={collapsed ? item.label : undefined}
              className={`relative flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] transition-all duration-150 ${
                collapsed ? "justify-center px-0" : ""
              } ${
                isActive
                  ? "bg-sidebar-accent-bg font-semibold text-sidebar-accent"
                  : "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-text"
              }`}
            >
              {isActive && (
                <span className="absolute -left-3 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-sidebar-accent shadow-accent-glow" />
              )}
              <Icon size={16} strokeWidth={2} />
              {!collapsed && item.label}
            </div>
          );
        })}
      </nav>

      {/* Profile + sign out — moved down here from the top-of-screen header
          (App.tsx's UserMenu) so it lives with the rest of the account
          chrome, in the spot the old hackathon-credit footer used to
          occupy. */}
      <div className={`border-t border-sidebar-border p-3 ${collapsed ? "flex flex-col items-center gap-2" : ""}`}>
        {collapsed ? (
          <>
            <div
              title={`${session?.username ?? ""} (${session?.role ?? ""})`}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-accent-bg text-[12px] font-bold text-sidebar-accent"
            >
              {initial}
            </div>
            <button
              onClick={logout}
              title="Sign out"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-high"
            >
              <LogOut size={15} strokeWidth={2.25} />
            </button>
          </>
        ) : (
          <div className="flex items-center gap-2.5 rounded-lg px-1 py-1">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent-bg text-[12px] font-bold text-sidebar-accent">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-semibold text-sidebar-text">{session?.username}</div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-sidebar-muted">{session?.role}</div>
            </div>
            <button
              onClick={logout}
              title="Sign out"
              className="shrink-0 rounded-lg p-1.5 text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-high"
            >
              <LogOut size={15} strokeWidth={2.25} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
