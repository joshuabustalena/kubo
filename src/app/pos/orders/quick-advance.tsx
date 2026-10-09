"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import { updateOrderStatus } from "../actions";

const NEXT: Record<string, { to: string; label: string }> = {
  pending: { to: "confirmed", label: "Confirm" },
  confirmed: { to: "preparing", label: "Start preparing" },
  preparing: { to: "ready", label: "Mark ready" },
  ready: { to: "completed", label: "Complete" },
};

export function QuickAdvance({ orderId, status, paid }: { orderId: string; status: string; paid: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const next = NEXT[status];
  if (!next) return null;
  if (next.to === "completed" && !paid) {
    return (
      <Link href={`/pos/orders/${orderId}`} className="mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-gold-400 text-sm font-bold text-wood-800">
        Take payment <ArrowRight className="size-4" />
      </Link>
    );
  }
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await updateOrderStatus(orderId, next.to, "", null);
          if (!res.ok) toast.error(res.error);
          router.refresh();
        })
      }
      className="mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-forest-800 text-sm font-bold text-cream-50 hover:bg-forest-700 disabled:opacity-60"
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : null} {next.label} <ArrowRight className="size-4" />
    </button>
  );
}
