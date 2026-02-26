import { useEffect, type ReactNode } from "react";
import { cn } from "./cn";

interface ModalProps {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

export function Modal({ open, title, onClose, children, className }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-4"
      onClick={onClose}
      role="presentation"
    >
      <section
        className={cn("w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5", className)}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {title ? <h2 className="mb-3 text-lg font-semibold text-slate-100">{title}</h2> : null}
        {children}
      </section>
    </div>
  );
}

