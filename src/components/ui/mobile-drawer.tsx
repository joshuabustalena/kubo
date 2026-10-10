"use client";

import { X } from "lucide-react";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

const noopSubscribe = () => () => {};

/**
 * Slide-in menu for small screens. Closes when the backdrop is tapped, when
 * Esc is pressed, or when any link inside it is tapped. Locks page scroll
 * while open. Rendered into <body> so headers with backdrop-blur (which trap
 * fixed children) can't shrink it.
 */
export function MobileDrawer({
  open,
  onClose,
  title,
  side = "right",
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  side?: "left" | "right";
  className?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!mounted) return null;

  return createPortal(
    // overflow-hidden: the parked (closed) panel must not widen the page on phones;
    // invisible when closed so its links can't be tabbed to (switches after the slide-out)
    <div
      className={cn(
        "fixed inset-0 z-[60] overflow-hidden transition-[visibility] duration-200 lg:hidden",
        open ? "visible" : "pointer-events-none invisible",
      )}
      aria-hidden={!open}
    >
      {/* backdrop: tap anywhere outside the menu to close */}
      <div
        className={cn("absolute inset-0 bg-wood-800/55 backdrop-blur-[2px] transition-opacity duration-200", open ? "opacity-100" : "opacity-0")}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "absolute inset-y-0 flex w-[min(20rem,86vw)] flex-col overflow-y-auto shadow-[var(--shadow-lift)] transition-transform duration-200",
          side === "right" ? "right-0" : "left-0",
          open ? "translate-x-0" : side === "right" ? "translate-x-full" : "-translate-x-full",
          className,
        )}
        // tapping any link (or a button marked data-close) closes the menu
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a,[data-close]")) onClose();
        }}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 grid size-10 place-items-center rounded-lg opacity-80 hover:opacity-100"
          aria-label="Close menu"
        >
          <X className="size-5" />
        </button>
        {children}
      </div>
    </div>,
    document.body,
  );
}
