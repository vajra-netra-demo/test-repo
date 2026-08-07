import { ChevronDown } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  className?: string;
  // Px, not a Tailwind class — this varies a lot by use site (a tenant
  // picker with long org names needs far more room than a 2-option Role
  // field inline in a form row), so it's a plain style value rather than
  // a hardcoded min-w-[...] baked into the component.
  minWidth?: number;
}

// A native <select>'s open option list is rendered by the OS/browser, not
// this stylesheet — on Windows Chrome it ignores `color-scheme: dark` and
// shows a plain white popup no matter what theme the rest of the page is
// in. This is a fully custom dropdown (button + floating listbox we render
// ourselves) so it can actually be styled, in both themes, like everything
// else in the app.
//
// The list is rendered through a portal into document.body rather than as
// a normal absolutely-positioned child — any ancestor with backdrop-filter
// (every .glass panel in this app) establishes its own stacking context,
// which traps a z-indexed descendant inside it. Two glass panels stacked
// on a page (e.g. the "Create account" card above the users table) each
// get their own context; the later one always paints over the earlier
// one's overflowing content regardless of the dropdown's own z-index. A
// portal escapes every ancestor's stacking context, so this can't recur
// wherever Dropdown gets used next to another glass surface.
export function Dropdown({ value, onChange, options, className, minWidth = 160 }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const current = options.find((o) => o.value === value);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const update = () => {
      const r = triggerRef.current!.getBoundingClientRect();
      setRect({ top: r.bottom + 6, left: r.left, width: Math.max(r.width, minWidth) });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, minWidth]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className={className}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{ minWidth }}
        className="glass flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-3.5 py-2.25 text-left text-[13px] font-semibold text-text transition-colors hover:border-accent/40 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
      >
        <span className="truncate">{current?.label ?? ""}</span>
        <ChevronDown size={15} strokeWidth={2.25} className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open &&
        rect &&
        createPortal(
          // Solid bg-popover, not .glass — this floats OVER other content
          // (charts, colored text, other glass panels), so it needs to
          // fully occlude what's behind it rather than blend with it.
          <ul
            ref={listRef}
            role="listbox"
            style={{ top: rect.top, left: rect.left, width: rect.width }}
            className="animate-view-fade fixed z-50 max-h-72 overflow-auto rounded-lg border border-border bg-popover py-1 shadow-xl"
          >
            {options.map((opt) => {
              const selected = opt.value === value;
              return (
                <li key={opt.value} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    className={`block w-full px-3.5 py-2 text-left text-[13px] transition-colors ${
                      selected ? "bg-accent-light font-semibold text-accent" : "text-text hover:bg-tint/[0.06]"
                    }`}
                  >
                    {opt.label}
                  </button>
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </div>
  );
}
