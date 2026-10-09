import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

const fieldBase =
  "w-full rounded-xl border border-bamboo-400/70 bg-white/80 px-3.5 text-[0.95rem] text-ink placeholder:text-ink-muted/70 transition-colors focus:border-forest-600 focus:bg-white focus:outline-none focus:ring-3 focus:ring-gold-300/50 disabled:opacity-60 aria-[invalid=true]:border-terracotta-500";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(fieldBase, "h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(fieldBase, "min-h-24 py-2.5", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select className={cn(fieldBase, "h-11 appearance-none bg-[length:12px] bg-[right_0.9rem_center] bg-no-repeat pr-9", className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%236b4226' stroke-width='1.8'/%3E%3C/svg%3E\")" }}
      {...props}>
      {children}
    </select>
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("text-sm font-semibold text-wood-700", className)} {...props} />;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-sm text-terracotta-600" role="alert">{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Checkbox({ label, className, ...props }: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2.5 text-sm text-ink", className)}>
      <input type="checkbox" className="size-4.5 rounded border-bamboo-500 accent-forest-700" {...props} />
      <span>{label}</span>
    </label>
  );
}
