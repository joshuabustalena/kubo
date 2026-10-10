"use client";

import { useEffect, useRef, type ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Table that never scrolls sideways on phones: below 768px each row becomes a
 * small card and every cell shows its column name (see `.rtable` in
 * globals.css). Column names are copied from the header into `data-label`.
 * `scrollHeight` gives it a fixed height with vertical scrolling and a sticky header.
 */
export function Table({ className, scrollHeight, ...props }: ComponentProps<"table"> & { scrollHeight?: string }) {
  const ref = useRef<HTMLTableElement>(null);

  useEffect(() => {
    const table = ref.current;
    if (!table) return;
    const label = () => {
      const heads = [...table.querySelectorAll("thead th")].map((th) => (th.textContent ?? "").trim());
      for (const row of table.querySelectorAll("tbody tr")) {
        let col = 0;
        for (const cell of row.children) {
          const td = cell as HTMLTableCellElement;
          // A cell spanning several columns (totals, messages) gets no label
          const text = td.colSpan > 1 ? "" : (heads[col] ?? "");
          if (td.dataset.label !== text) td.dataset.label = text;
          col += td.colSpan || 1;
        }
      }
    };
    label();
    const observer = new MutationObserver(label);
    observer.observe(table, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={cn("w-full md:overflow-x-auto", scrollHeight && "overflow-y-auto md:[&_th]:sticky md:[&_th]:top-0 md:[&_th]:z-10 md:[&_th]:bg-cream-200")}
      style={scrollHeight ? { maxHeight: scrollHeight } : undefined}
    >
      <table ref={ref} className={cn("rtable w-full border-collapse text-sm", className)} {...props} />
    </div>
  );
}

export function Th({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "border-b border-bamboo-300/60 bg-cream-200/60 px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wide text-wood-600 whitespace-nowrap first:pl-5 last:pr-5",
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("border-b border-bamboo-300/30 px-3 py-2.5 align-middle first:pl-5 last:pr-5", className)} {...props} />;
}

export function Tr({ className, ...props }: ComponentProps<"tr">) {
  return <tr className={cn("hover:bg-cream-200/40", className)} {...props} />;
}
