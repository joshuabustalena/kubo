"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { cancelMyOrder } from "../../checkout/actions";

export function CancelOrderButton({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  return (
    <>
      <Button variant="ghost" className="text-terracotta-600" onClick={() => setOpen(true)}>Cancel order</Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Cancel this order?"
        description="You can only cancel before the kitchen confirms it."
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>Keep order</Button>
            <Button
              variant="danger"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await cancelMyOrder(orderId, reason);
                  if (!res.ok) return setError(res.error);
                  setOpen(false);
                  toast.success("Your order was cancelled.");
                  router.refresh();
                })
              }
            >
              {pending ? "Cancelling…" : "Yes, cancel"}
            </Button>
          </>
        }
      >
        {error ? <Alert tone="error" className="mb-3">{error}</Alert> : null}
        <Field label="Reason (optional)" htmlFor="reason">
          <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
        </Field>
      </Dialog>
    </>
  );
}
