"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { addDays, manilaToday } from "@/lib/format";

/** Date range filter that writes ?from=&to= to the URL (Asia/Manila days). */
export function DateRangeFilter({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);

  const go = (nf: string, nt: string) => {
    const sp = new URLSearchParams(params.toString());
    sp.set("from", nf);
    sp.set("to", nt);
    router.push(`${path}?${sp.toString()}`);
  };
  const today = manilaToday();
  const monthStart = `${today.slice(0, 8)}01`;
  const presets = [
    { label: "Today", from: today, to: today },
    { label: "7 days", from: addDays(today, -6), to: today },
    { label: "30 days", from: addDays(today, -29), to: today },
    { label: "This month", from: monthStart, to: today },
  ];

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-wrap gap-1">
        {presets.map((p) => (
          <Button key={p.label} size="sm" variant={p.from === from && p.to === to ? "primary" : "outline"} onClick={() => { setF(p.from); setT(p.to); go(p.from, p.to); }}>
            {p.label}
          </Button>
        ))}
      </div>
      <form className="flex w-full flex-wrap items-end gap-1.5 sm:w-auto" onSubmit={(e) => { e.preventDefault(); go(f, t); }}>
        <label className="min-w-0 flex-1 text-xs font-semibold text-ink-muted sm:flex-none">From<Input type="date" value={f} max={t} onChange={(e) => setF(e.target.value)} className="h-9 w-full text-sm sm:w-[9.5rem]" /></label>
        <label className="min-w-0 flex-1 text-xs font-semibold text-ink-muted sm:flex-none">To<Input type="date" value={t} min={f} onChange={(e) => setT(e.target.value)} className="h-9 w-full text-sm sm:w-[9.5rem]" /></label>
        <Button size="sm" type="submit" variant="wood">Apply</Button>
      </form>
    </div>
  );
}
