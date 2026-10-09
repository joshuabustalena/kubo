import { Check, X } from "lucide-react";
import { timeOnly } from "@/lib/format";
import { cn } from "@/lib/utils";

const STEPS = [
  { status: "pending", label: "Order placed" },
  { status: "confirmed", label: "Confirmed" },
  { status: "preparing", label: "Preparing" },
  { status: "ready", label: "Ready for pickup" },
  { status: "completed", label: "Completed" },
] as const;

export function OrderTimeline({ status, history }: { status: string; history: { to_status: string; created_at: string }[] }) {
  if (status === "cancelled") {
    const at = history.find((h) => h.to_status === "cancelled")?.created_at;
    return (
      <div className="flex items-center gap-3 rounded-xl bg-terracotta-100 p-4 text-terracotta-700">
        <span className="grid size-9 place-items-center rounded-full bg-terracotta-600 text-cream-50"><X className="size-5" /></span>
        <div>
          <p className="font-bold">Order cancelled</p>
          {at ? <p className="text-sm">at {timeOnly(at)}</p> : null}
        </div>
      </div>
    );
  }
  const current = STEPS.findIndex((s) => s.status === status);
  return (
    <ol className="grid grid-cols-5 gap-1" aria-label="Order progress">
      {STEPS.map((s, i) => {
        const done = i <= current;
        const at = history.find((h) => h.to_status === s.status)?.created_at;
        return (
          <li key={s.status} className="flex flex-col items-center text-center" aria-current={i === current ? "step" : undefined}>
            <div className="flex w-full items-center">
              <span className={cn("h-1 flex-1 rounded-full", i === 0 ? "opacity-0" : done ? "bg-forest-700" : "bg-bamboo-300")} />
              <span
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-full border-2 text-sm font-bold",
                  done ? "border-forest-700 bg-forest-700 text-cream-50" : "border-bamboo-400 bg-cream-50 text-bamboo-600",
                  i === current && status !== "completed" && "ring-4 ring-gold-300/60",
                )}
              >
                {done ? <Check className="size-4" /> : i + 1}
              </span>
              <span className={cn("h-1 flex-1 rounded-full", i === STEPS.length - 1 ? "opacity-0" : i < current ? "bg-forest-700" : "bg-bamboo-300")} />
            </div>
            <span className={cn("mt-1.5 text-[0.7rem] font-semibold leading-tight sm:text-xs", done ? "text-forest-800" : "text-ink-muted")}>{s.label}</span>
            {at ? <span className="text-[0.65rem] text-ink-muted">{timeOnly(at)}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
