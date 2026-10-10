"use client";

import { ChevronDown, Printer } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A report card that folds into a tap-to-open dropdown. Open on desktop,
 * starts folded on phones so the page stays short. Always printed open.
 */
export function ReportSection({
  title,
  description,
  summary,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** Key figure shown next to the title, visible even when folded */
  summary?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (ref.current && window.matchMedia("(max-width: 767.98px)").matches) ref.current.open = false;
  }, []);
  return (
    <details ref={ref} open className={cn("paper group overflow-hidden print:break-inside-avoid", className)}>
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 border-b border-bamboo-300/40 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <h2 className="text-lg font-bold leading-tight text-wood-800">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-ink-muted">{description}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {summary ? <span className="font-display text-lg font-extrabold text-forest-700">{summary}</span> : null}
          <ChevronDown className="size-5 text-ink-muted transition-transform group-open:rotate-180 print:hidden" aria-hidden />
        </div>
      </summary>
      {children}
    </details>
  );
}

/** Opens every folded section, then the browser's print dialog ("Save as PDF" works there too). */
export function PrintButton({ label = "Print / Save as PDF" }: { label?: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="no-print"
      onClick={() => {
        const folded = [...document.querySelectorAll("details:not([open])")] as HTMLDetailsElement[];
        folded.forEach((d) => (d.open = true));
        const restore = () => {
          folded.forEach((d) => (d.open = false));
          window.removeEventListener("afterprint", restore);
        };
        window.addEventListener("afterprint", restore);
        // let the opened sections (and charts) lay out before printing
        setTimeout(() => window.print(), 150);
      }}
    >
      <Printer /> {label}
    </Button>
  );
}
