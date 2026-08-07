import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

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

  const showToast = useCallback((message: string, type: ToastType = "info", durationMs = 4000) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, durationMs);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed top-5 right-5 z-[1000] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-toast-in max-w-[360px] rounded-lg border border-border ${BORDER_BY_TYPE[t.type]} border-l-4 bg-card p-3 px-4 text-[13px] shadow-lg`}
          >
            {t.message}
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
