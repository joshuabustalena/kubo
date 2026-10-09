import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ring-1 ring-inset",
  {
    variants: {
      tone: {
        neutral: "bg-cream-200 text-wood-700 ring-bamboo-400/50",
        green: "bg-leaf-50 text-leaf-700 ring-leaf-500/30",
        forest: "bg-forest-800 text-cream-50 ring-forest-900",
        gold: "bg-gold-100 text-gold-700 ring-gold-400/50",
        red: "bg-terracotta-100 text-terracotta-700 ring-terracotta-500/30",
        blue: "bg-sky-50 text-sky-800 ring-sky-600/20",
        purple: "bg-violet-50 text-violet-800 ring-violet-600/20",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({ className, tone, ...props }: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

const statusTone: Record<string, VariantProps<typeof badgeVariants>["tone"]> = {
  pending: "gold",
  confirmed: "blue",
  preparing: "purple",
  ready: "green",
  completed: "forest",
  cancelled: "red",
};

export function OrderStatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTone[status] ?? "neutral"}>{ORDER_STATUS_LABEL[status] ?? status}</Badge>;
}

const payTone: Record<string, VariantProps<typeof badgeVariants>["tone"]> = {
  unpaid: "neutral",
  pending_verification: "gold",
  paid: "green",
  partially_refunded: "red",
  refunded: "red",
};

export function PaymentStatusBadge({ status }: { status: string }) {
  return <Badge tone={payTone[status] ?? "neutral"}>{PAYMENT_STATUS_LABEL[status] ?? status}</Badge>;
}
