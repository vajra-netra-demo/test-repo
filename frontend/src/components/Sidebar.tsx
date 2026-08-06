import { Contact, LayoutDashboard, MonitorSmartphone, ScanSearch, Scale, ShieldCheck, Users } from "lucide-react";
import type { ComponentType } from "react";
import { useAuth } from "../auth/AuthProvider";
import type { ViewKey } from "../types/view";

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
// mistake is exactly how NETRA's wordmark went dark-text-on-dark-sidebar
// illegible the first time this shipped with light mode.
export function Sidebar({ active, onSelect }: SidebarProps) {
  const { isAdmin } = useAuth();
  const items = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  return (
    <div className="relative flex w-[240px] shrink-0 flex-col bg-gradient-to-b from-sidebar to-sidebar-end py-6">
      {/* Signature edge — a thin cyan seam separating the sidebar from the
          canvas, the one deliberate "brand line" in the whole UI. */}
      <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-sidebar-accent/40 via-sidebar-accent/10 to-transparent" />

      <div className="flex items-center gap-3 border-b border-sidebar-border px-6 pb-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-sidebar-accent to-accent-dark text-[15px] font-extrabold text-[#03151a] shadow-accent-glow">
          N
        </div>
        <div>
          <div className="text-[17px] font-extrabold tracking-wide text-sidebar-text">NETRA</div>
          <div className="text-[10.5px] leading-snug text-sidebar-muted">Privacy & Shadow-IT Discovery</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-3 pt-4">
        {items.map((item) => {
          const isActive = active === item.key;
          const Icon = item.icon;
          return (
            <div
              key={item.key}
              onClick={() => onSelect(item.key)}
              className={`relative flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] transition-all duration-150 ${
                isActive
                  ? "bg-sidebar-accent-bg font-semibold text-sidebar-accent"
                  : "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-text"
              }`}
            >
              {isActive && (
                <span className="absolute -left-3 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-sidebar-accent shadow-accent-glow" />
              )}
              <Icon size={16} strokeWidth={2} />
              {item.label}
            </div>
          );
        })}
      </nav>

      <div className="mx-3 mb-3 flex items-center gap-2 rounded-lg border border-sidebar-good/20 bg-sidebar-good-bg px-3 py-2 text-[10.5px] font-semibold text-sidebar-good-text">
        <ShieldCheck size={13} strokeWidth={2.25} />
        Read-only discovery — no destructive action without confirmation
      </div>

      <div className="border-t border-sidebar-border px-6 py-4 text-[11px] text-sidebar-muted">
        Team Vajra
        <br />
        Swaraj CloudForge Hackathon 2026
      </div>
    </div>
  );
}
