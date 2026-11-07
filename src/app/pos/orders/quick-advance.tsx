"use client";

import { Check, Loader2, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PaymentDialog, type Bill } from "@/components/orders/order-manager";
import { useToast } from "@/components/ui/toast";
import { peso } from "@/lib/format";
import type { PaymentMethod } from "@/lib/types";
import { payAndComplete } from "../actions";

const btn = "mt-2 flex h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-forest-800 text-sm font-bold text-cream-50 hover:bg-forest-700 disabled:opacity-60";

/** Unpaid: "Take payment" (cash received, change) → order completed. Already paid: one-tap Complete. */
export function QuickAdvance({ orderId, bill, paid, methods }: { orderId: string; bill: Bill; paid: boolean; methods: PaymentMethod[] }) {
  const total = bill.total;
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  if (paid) {
    return (
      <button
        type="button"
        disabled={pending}
        className={btn}
        onClick={() =>
          start(async () => {
            const res = await payAndComplete(orderId);
            if (!res.ok) toast.error(res.error);
            else toast.success("Order completed.");
            router.refresh();
          })
        }
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Complete
      </button>
    );
  }
  return (
    <>
      <button type="button" className={btn} onClick={() => setOpen(true)}>
        <Wallet className="size-4" /> Take payment · {peso(total)}
      </button>
      <PaymentDialog
        open={open}
        onClose={() => setOpen(false)}
        orderId={orderId}
        bill={bill}
        methods={methods}
        onCancelled={() => {
          setOpen(false);
          toast.success("Order cancelled.");
          router.refresh();
        }}
        onDone={(change) => {
          setOpen(false);
          toast.success(change > 0 ? `Paid and completed. Change: ${peso(change)}` : "Paid and completed.");
          router.refresh();
        }}
      />
    </>
  );
}
