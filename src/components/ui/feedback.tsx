import { AlertTriangle, CheckCircle2, Info, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: "info" | "success" | "error" | "warning";
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const styles = {
    info: "bg-cream-200/70 border-bamboo-400/60 text-wood-800",
    success: "bg-leaf-50 border-leaf-500/40 text-leaf-700",
    error: "bg-terracotta-100 border-terracotta-500/40 text-terracotta-700",
    warning: "bg-gold-100 border-gold-400/60 text-gold-700",
  }[tone];
  const Icon = { info: Info, success: CheckCircle2, error: AlertTriangle, warning: AlertTriangle }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex gap-3 rounded-xl border px-4 py-3 text-sm", styles, className)}>
      <Icon className="mt-0.5 size-4.5 shrink-0" aria-hidden />
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title && "mt-0.5", "leading-relaxed")}>{children}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-6 py-12 text-center", className)}>
      {icon ? <div className="mb-1 grid size-14 place-items-center rounded-full bg-cream-200 text-bamboo-600 [&_svg]:size-7">{icon}</div> : null}
      <p className="font-display text-lg font-bold text-wood-800">{title}</p>
      {children ? <div className="max-w-sm text-sm text-ink-muted">{children}</div> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return (
    <span role="status" className={cn("inline-flex items-center gap-2 text-sm text-ink-muted", className)}>
      <Loader2 className="size-4 animate-spin" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function PageLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center gap-3 text-ink-muted" role="status">
      <Loader2 className="size-5 animate-spin" aria-hidden />
      <span>{label}</span>
    </div>
  );
}
