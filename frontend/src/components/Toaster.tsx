import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

type ToastType = "info" | "success" | "error";
interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastApi {
  showToast: (message: string, type?: ToastType, durationMs?: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const BORDER_BY_TYPE: Record<ToastType, string> = {
  info: "border-l-accent",
  success: "border-l-low",
  error: "border-l-high",
};

// Direct port of the original showToast()/#toastContainer pattern — a fixed
// top-right stack of self-dismissing cards, driven here by state instead of
// manual DOM node creation/removal.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Errors are the one case someone actually needs to read carefully (often
  // to copy/report the exact reason) -- auto-dismissing them on the same
  // 4s timer as a routine "success" toast meant a real failure message
  // could vanish before it was even fully read. They now stay until
  // manually closed; info/success keep the old auto-dismiss behavior
  // unless a caller passes an explicit durationMs.
  const showToast = useCallback((message: string, type: ToastType = "info", durationMs?: number) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, message, type }]);
    const effectiveDuration = durationMs ?? (type === "error" ? null : 4000);
    if (effectiveDuration !== null) {
      setTimeout(() => dismiss(id), effectiveDuration);
    }
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed top-5 right-5 z-[1000] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-toast-in flex max-w-[360px] items-start gap-2 rounded-lg border border-border ${BORDER_BY_TYPE[t.type]} border-l-4 bg-card p-3 px-4 text-[13px] shadow-lg`}
          >
            <span className="flex-1 leading-relaxed">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              title="Dismiss"
              className="-mr-1 -mt-0.5 shrink-0 rounded p-0.5 text-muted transition-colors hover:bg-tint/[0.08] hover:text-text"
            >
              <X size={14} strokeWidth={2.25} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
