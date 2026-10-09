"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Accessible modal built on the native <dialog> element. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        "m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-bamboo-400/50 bg-cream-50 p-0 text-ink shadow-[var(--shadow-lift)] backdrop:bg-wood-800/45 backdrop:backdrop-blur-[2px]",
        className,
      )}
    >
      {open ? (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-bamboo-300/50 px-5 py-4">
            <div>
              <h2 className="font-display text-xl font-bold text-wood-800">{title}</h2>
              {description ? <p className="mt-0.5 text-sm text-ink-muted">{description}</p> : null}
            </div>
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-ink-muted hover:bg-cream-200" aria-label="Close">
              <X className="size-5" />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-bamboo-300/50 px-5 py-3">{footer}</div> : null}
        </div>
      ) : null}
    </dialog>
  );
}
