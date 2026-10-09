import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Stat({ label, value, hint, tone, className }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "good" | "bad"; className?: string }) {
  return (
    <div className={cn("paper p-4", className)}>
      <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">{label}</p>
      <p className={cn("mt-1 font-display text-2xl font-extrabold leading-tight text-wood-800 sm:text-[1.7rem]", tone === "bad" && "text-terracotta-600")}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}

/** Label/value rows for a P&L style breakdown. */
export function Ledger({ rows }: { rows: { label: ReactNode; value: ReactNode; strong?: boolean; negative?: boolean; hint?: ReactNode }[] }) {
  return (
    <dl className="divide-y divide-bamboo-300/40 text-sm">
      {rows.map((r, i) => (
        <div key={i} className={cn("flex items-baseline justify-between gap-3 py-2", r.strong && "font-bold")}>
          <dt>{r.label}{r.hint ? <span className="block text-xs font-normal text-ink-muted">{r.hint}</span> : null}</dt>
          <dd className={cn("tabular-nums", r.negative && "text-terracotta-600")}>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
