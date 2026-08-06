import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  className?: string;
}

// A native <select>'s open option list is rendered by the OS/browser, not
// this stylesheet — on Windows Chrome it ignores `color-scheme: dark` and
// shows a plain white popup no matter what theme the rest of the page is
// in. This is a fully custom dropdown (button + floating listbox we render
// ourselves) so it can actually be styled, in both themes, like everything
// else in the app.
export function Dropdown({ value, onChange, options, className }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
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
    <div ref={rootRef} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="glass flex w-full min-w-[420px] cursor-pointer items-center justify-between gap-2 rounded-lg px-3.5 py-2.25 text-left text-[13px] font-semibold text-text transition-colors hover:border-accent/40 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
      >
        <span className="truncate">{current?.label ?? ""}</span>
        <ChevronDown size={15} strokeWidth={2.25} className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        // Solid bg-popover, not .glass — this floats OVER other content
        // (charts, colored text), so it needs to fully occlude what's
        // behind it rather than blend with it like an in-flow glass panel.
        <ul
          role="listbox"
          className="animate-view-fade absolute z-20 mt-1.5 max-h-72 w-full min-w-[420px] overflow-auto rounded-lg border border-border bg-popover py-1 shadow-xl"
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
        </ul>
      )}
    </div>
  );
}
