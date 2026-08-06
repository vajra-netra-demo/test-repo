import { useEffect } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: number;
}

// Generic overlay + centered panel, portalled to document.body — same
// reasoning as Dropdown.tsx's portal: escapes every ancestor's
// backdrop-filter stacking context instead of getting trapped/occluded by
// one. Esc and a backdrop click both close it; background scroll is
// suspended while it's open so the page behind it can't drift.
export function Modal({ onClose, children, maxWidth = 640 }: ModalProps) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div
      className="animate-view-fade fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth }}
        className="animate-modal-in flex max-h-[82vh] w-full flex-col overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
