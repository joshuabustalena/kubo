"use client";

import { Ban, Check, Loader2, Printer, Undo2, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { payAndComplete, recordPayment, refundOrder, updateOrderStatus, verifyPayment } from "@/app/pos/actions";
import { useOverride } from "@/components/pos/override";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { peso } from "@/lib/format";
import type { OrderDetail } from "@/lib/orders";
import type { PaymentMethod } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Staff/admin actions on one order. Every action is re-authorized by the database. */
export function OrderManager({ order, methods }: { order: OrderDetail; methods: PaymentMethod[] }) {
  const router = useRouter();
  const toast = useToast();
  const { run, dialog } = useOverride();
  const [busy, start] = useTransition();
  const [payOpen, setPayOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pendingPayment = order.payments.find((p) => p.status === "pending");
  const isOpen = !["completed", "cancelled"].includes(order.status);

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? "Something went wrong.");
        return;
      }
      toast.success(success);
      router.refresh();
    });

  return (
    <div className="space-y-4">
      {dialog}
      {error ? <Alert tone="error">{error}</Alert> : null}

      {pendingPayment ? (
        <div className="rounded-xl border border-gold-400/60 bg-gold-100 p-4">
          <p className="font-bold text-gold-700">Verify {pendingPayment.method_code.toUpperCase()} payment</p>
          <p className="text-sm">Amount {peso(pendingPayment.amount)} · Reference <span className="font-mono font-bold">{pendingPayment.reference_no}</span></p>
          <p className="text-xs text-ink-muted">Check the GCash app/merchant SMS for this reference before approving.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => act(() => verifyPayment(pendingPayment.id, true, "", order.id), "Payment verified.")}>
              <Check /> Payment received
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => verifyPayment(pendingPayment.id, false, "Not found", order.id), "Payment rejected.")}>
              Not found
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {isOpen && order.payment_status !== "paid" ? (
          <Button onClick={() => setPayOpen(true)}><Wallet /> Take payment</Button>
        ) : null}
        {isOpen && order.payment_status === "paid" ? (
          <Button disabled={busy} onClick={() => act(() => payAndComplete(order.id), "Order completed.")}>
            {busy ? <Loader2 className="animate-spin" /> : <Check />} Complete
          </Button>
        ) : null}
        {isOpen ? (
          <Button variant="outline" className="text-terracotta-600" onClick={() => setCancelOpen(true)}>
            <Ban /> {order.payment_status === "paid" ? "Void order" : "Cancel order"}
          </Button>
        ) : null}
        {order.status === "completed" && ["paid", "partially_refunded"].includes(order.payment_status) ? (
          <Button variant="outline" onClick={() => setRefundOpen(true)}><Undo2 /> Refund</Button>
        ) : null}
        <Link href={`/pos/receipt/${order.id}`} target="_blank" className="inline-flex h-11 items-center gap-2 rounded-xl px-4 font-semibold text-wood-700 ring-1 ring-bamboo-400 hover:bg-cream-200">
          <Printer className="size-4" /> Receipt
        </Link>
      </div>

      <PaymentDialog open={payOpen} onClose={() => setPayOpen(false)} onCancelled={() => { setPayOpen(false); toast.success("Order cancelled."); router.refresh(); }} orderId={order.id} bill={order} methods={methods} onDone={(change) => { setPayOpen(false); toast.success(change > 0 ? `Paid and completed. Change: ${peso(change)}` : "Paid and completed."); router.refresh(); }} />

      <CancelDialog
        open={cancelOpen}
        paid={order.payment_status === "paid"}
        amount={order.total - order.refunded_total}
        onClose={() => setCancelOpen(false)}
        onConfirm={async (reason) => {
          const res = await run("void_order", (grant) => updateOrderStatus(order.id, "cancelled", reason, grant));
          if (!res.ok) return res.error;
          setCancelOpen(false);
          toast.success(order.payment_status === "paid" ? "Order voided. Return the money to the customer." : "Order cancelled.");
          router.refresh();
          return null;
        }}
      />

      <RefundDialog
        open={refundOpen}
        order={order}
        onClose={() => setRefundOpen(false)}
        onConfirm={async (items, reason, restock) => {
          const res = await run("refund_order", (grant) => refundOrder(order.id, items, reason, restock, grant));
          if (!res.ok) return res.error;
          setRefundOpen(false);
          toast.success(`Refunded ${peso(res.data.amount)}${res.data.points_reversed ? ` · ${res.data.points_reversed} points reversed` : ""}.`);
          router.refresh();
          return null;
        }}
      />
    </div>
  );
}

/** What the customer is paying for, shown in the Take payment window. */
export type Bill = {
  items: { id?: string; quantity: number; product_name: string; unit_price: number; line_total: number; parent_item_id: string | null }[];
  subtotal: number;
  packaging_fee: number;
  discount_total: number;
  discount_reason?: string | null;
  total: number;
};

/** Takes payment at the counter and completes the order in the same step. */
export function PaymentDialog({ open, onClose, orderId, bill, methods, onDone, onCancelled }: { open: boolean; onClose: () => void; orderId: string; bill: Bill; methods: PaymentMethod[]; onDone: (change: number) => void; onCancelled?: () => void }) {
  const total = bill.total;
  const meals = bill.items.filter((i) => !i.parent_item_id);
  const addonsOf = (id?: string) => (id ? bill.items.filter((a) => a.parent_item_id === id) : []);
  const [method, setMethod] = useState(methods[0]?.code ?? "");
  const [tendered, setTendered] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  // Wrong or duplicate order: cancel it from here (unpaid orders need no PIN)
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const m = methods.find((x) => x.code === method);
  const cash = Number(tendered) || 0;
  const close = () => { setCancelling(false); setReason(""); setError(null); onClose(); };
  const cancelOrder = () =>
    start(async () => {
      setError(null);
      const res = await updateOrderStatus(orderId, "cancelled", reason.trim(), null);
      if (!res.ok) return setError(res.error);
      setCancelling(false);
      setReason("");
      onCancelled?.();
    });
  return (
    <Dialog
      open={open}
      onClose={close}
      title={cancelling ? "Cancel this order?" : `Take payment · ${peso(total)}`}
      footer={
        cancelling ? (
          <>
            <Button variant="outline" disabled={busy} onClick={() => setCancelling(false)}>Back</Button>
            <Button variant="outline" className="text-terracotta-600 ring-terracotta-600/40" disabled={busy || !reason.trim()} onClick={cancelOrder}>
              {busy ? <Loader2 className="animate-spin" /> : <Ban />} Cancel order
            </Button>
          </>
        ) : (
        <>
          <Button variant="ghost" className="mr-auto text-terracotta-600" disabled={busy} onClick={() => setCancelling(true)}><Ban /> Cancel order</Button>
          <Button variant="outline" onClick={close}>Close</Button>
          <Button
            disabled={busy || (m?.is_cash ? cash < total : m?.requires_reference ? reference.trim().length < 4 : false)}
            onClick={() =>
              start(async () => {
                const res = await recordPayment(orderId, method, m?.is_cash ? cash : null, reference);
                if (!res.ok) return setError(res.error);
                const done = await payAndComplete(orderId);
                if (!done.ok) return setError(done.error);
                onDone(res.data.change);
              })
            }
          >
            {busy ? <Loader2 className="animate-spin" /> : <Check />} Paid — complete order
          </Button>
        </>
        )
      }
    >
      {error ? <Alert tone="error" className="mb-3">{error}</Alert> : null}
      {cancelling ? (
        <div className="mb-4 space-y-2">
          <p className="text-sm text-ink-muted">The order is removed from the queue and nothing is charged. Pick or type a reason:</p>
          <div className="flex flex-wrap gap-1.5">
            {["Wrong order", "Duplicate order", "Customer didn't come", "Changed their mind"].map((r) => (
              <button key={r} type="button" onClick={() => setReason(r)} className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold ring-1", reason === r ? "bg-terracotta-600 text-cream-50 ring-terracotta-600" : "bg-white ring-bamboo-400/60")}>
                {r}
              </button>
            ))}
          </div>
          <Input aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Reason" />
        </div>
      ) : null}
      <div className="mb-4 rounded-xl bg-white/70 p-3 ring-1 ring-bamboo-300/60">
        <ul className="space-y-1.5 text-sm">
          {meals.map((i, idx) => (
            <li key={i.id ?? idx}>
              <div className="flex justify-between gap-3">
                <span><b>{i.quantity}×</b> {i.product_name} <span className="text-ink-muted">@ {peso(i.unit_price)}</span></span>
                <span className="tabular-nums">{peso(i.line_total)}</span>
              </div>
              {addonsOf(i.id).map((a, j) => (
                <div key={a.id ?? j} className="flex justify-between gap-3 pl-4 text-xs text-ink-muted">
                  <span>+ {a.quantity}× {a.product_name} @ {peso(a.unit_price)}</span>
                  <span className="tabular-nums">{peso(a.line_total)}</span>
                </div>
              ))}
            </li>
          ))}
        </ul>
        <dl className="mt-3 space-y-0.5 border-t border-bamboo-300/60 pt-2 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd className="tabular-nums">{peso(bill.subtotal)}</dd></div>
          {bill.packaging_fee > 0 ? <div className="flex justify-between"><dt>Takeout packaging</dt><dd className="tabular-nums">{peso(bill.packaging_fee)}</dd></div> : null}
          {bill.discount_total > 0 ? <div className="flex justify-between text-leaf-700"><dt>{bill.discount_reason || "Discount"}</dt><dd className="tabular-nums">−{peso(bill.discount_total)}</dd></div> : null}
          <div className="flex items-baseline justify-between pt-1"><dt className="font-bold">Total</dt><dd className="font-display text-2xl font-extrabold text-forest-800">{peso(total)}</dd></div>
        </dl>
      </div>
      {!cancelling ? (
      <>
      <div className="mb-3 flex gap-2">
        {methods.map((x) => (
          <button key={x.code} type="button" onClick={() => setMethod(x.code)} className={cn("flex-1 rounded-lg py-2 font-bold", method === x.code ? "bg-wood-600 text-cream-50" : "bg-white ring-1 ring-bamboo-400/60")}>
            {x.name}
          </button>
        ))}
      </div>
      {m?.is_cash ? (
        <Field label="Cash received" htmlFor="tender">
          <Input id="tender" type="number" inputMode="decimal" min={0} step="0.01" value={tendered} onChange={(e) => setTendered(e.target.value)} autoFocus />
          <div className="mt-2 flex gap-1.5">
            {[total, 100, 200, 500, 1000].filter((v, i) => i === 0 || v > total).slice(0, 4).map((v, i) => (
              <button key={v} type="button" onClick={() => setTendered(String(v))} className="flex-1 rounded-lg bg-white py-1.5 text-sm font-bold ring-1 ring-bamboo-400/60">
                {i === 0 ? "Exact" : peso(v).replace(".00", "")}
              </button>
            ))}
          </div>
          {cash > 0 ? <p className={cn("mt-1 text-right font-bold", cash >= total ? "text-leaf-700" : "text-terracotta-600")}>{cash >= total ? `Change ${peso(cash - total)}` : `Short ${peso(total - cash)}`}</p> : null}
        </Field>
      ) : m?.requires_reference ? (
        <Field label="Reference number" htmlFor="pref">
          <Input id="pref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={60} />
        </Field>
      ) : null}
      </>
      ) : null}
    </Dialog>
  );
}

function CancelDialog({ open, paid, amount, onClose, onConfirm }: { open: boolean; paid: boolean; amount: number; onClose: () => void; onConfirm: (reason: string) => Promise<string | null> }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={paid ? "Void this paid order?" : "Cancel this order?"}
      description={paid ? `This records a void of ${peso(amount)}. Return the money to the customer.` : "The customer will see the reason."}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Keep order</Button>
          <Button variant="danger" disabled={busy || reason.trim().length < 3} onClick={() => start(async () => setError(await onConfirm(reason)))}>
            {busy ? <Loader2 className="animate-spin" /> : null} {paid ? "Void order" : "Cancel order"}
          </Button>
        </>
      }
    >
      {error ? <Alert tone="error" className="mb-3">{error}</Alert> : null}
      <Field label="Reason" htmlFor="cancel-reason" hint="Saved in the audit log.">
        <Textarea id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className="min-h-16" />
      </Field>
    </Dialog>
  );
}

function RefundDialog({
  open,
  order,
  onClose,
  onConfirm,
}: {
  open: boolean;
  order: OrderDetail;
  onClose: () => void;
  onConfirm: (items: { order_item_id: string; quantity: number }[], reason: string, restock: boolean) => Promise<string | null>;
}) {
  const refundable = order.items.filter((i) => i.quantity > i.refunded_quantity);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [restock, setRestock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const picked = Object.entries(qty).filter(([, q]) => q > 0).map(([order_item_id, quantity]) => ({ order_item_id, quantity }));
  const value = picked.reduce((s, p) => s + (order.items.find((i) => i.id === p.order_item_id)?.unit_price ?? 0) * p.quantity, 0);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Refund items"
      description="Discounts are shared proportionally. Points earned on refunded meals are taken back."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="danger" disabled={busy || picked.length === 0 || reason.trim().length < 3} onClick={() => start(async () => setError(await onConfirm(picked, reason, restock)))}>
            {busy ? <Loader2 className="animate-spin" /> : null} Refund about {peso(value)}
          </Button>
        </>
      }
    >
      {error ? <Alert tone="error" className="mb-3">{error}</Alert> : null}
      <ul className="space-y-2">
        {refundable.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-3">
            <span className="text-sm">{i.parent_item_id ? "+ " : ""}{i.product_name} <span className="text-ink-muted">({peso(i.unit_price)} each, {i.quantity - i.refunded_quantity} left)</span></span>
            <Input type="number" min={0} max={i.quantity - i.refunded_quantity} value={qty[i.id] ?? 0} onChange={(e) => setQty((q) => ({ ...q, [i.id]: Math.max(0, Math.min(i.quantity - i.refunded_quantity, Number(e.target.value) || 0)) }))} className="h-9 w-20" aria-label={`Refund quantity for ${i.product_name}`} />
          </li>
        ))}
      </ul>
      <Button variant="link" size="sm" onClick={() => setQty(Object.fromEntries(refundable.map((i) => [i.id, i.quantity - i.refunded_quantity])))}>Select everything</Button>
      <Field label="Reason" htmlFor="refund-reason" className="mt-2">
        <Textarea id="refund-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className="min-h-16" />
      </Field>
      <Checkbox className="mt-3" label="Return ingredients to stock (food was not made or served)" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
    </Dialog>
  );
}
