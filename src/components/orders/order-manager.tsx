"use client";

import { Ban, Check, Loader2, Printer, Undo2, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { recordPayment, refundOrder, updateOrderStatus, verifyPayment } from "@/app/pos/actions";
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

const NEXT: Record<string, { to: string; label: string }[]> = {
  pending: [{ to: "confirmed", label: "Confirm order" }],
  confirmed: [{ to: "preparing", label: "Start preparing" }, { to: "ready", label: "Mark ready" }],
  preparing: [{ to: "ready", label: "Mark ready for pickup" }],
  ready: [{ to: "completed", label: "Complete (handed over)" }],
};

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
  const canComplete = order.payment_status === "paid";

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
        {isOpen
          ? (NEXT[order.status] ?? []).map((n) => (
              <Button
                key={n.to}
                disabled={busy || (n.to === "completed" && !canComplete)}
                onClick={() => act(() => updateOrderStatus(order.id, n.to, "", null), `Order ${n.label.toLowerCase()}.`)}
              >
                {busy ? <Loader2 className="animate-spin" /> : null} {n.label}
              </Button>
            ))
          : null}
        {isOpen && order.payment_status === "unpaid" ? (
          <Button variant="gold" onClick={() => setPayOpen(true)}><Wallet /> Take payment</Button>
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
      {isOpen && order.status === "ready" && !canComplete ? <p className="text-sm text-ink-muted">Take payment before completing this order.</p> : null}

      <PaymentDialog open={payOpen} onClose={() => setPayOpen(false)} order={order} methods={methods} onDone={(change) => { setPayOpen(false); toast.success(change > 0 ? `Paid. Change: ${peso(change)}` : "Payment recorded."); router.refresh(); }} />

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

function PaymentDialog({ open, onClose, order, methods, onDone }: { open: boolean; onClose: () => void; order: OrderDetail; methods: PaymentMethod[]; onDone: (change: number) => void }) {
  const [method, setMethod] = useState(methods[0]?.code ?? "");
  const [tendered, setTendered] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const m = methods.find((x) => x.code === method);
  const cash = Number(tendered) || 0;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Take payment · ${peso(order.total)}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={busy || (m?.is_cash ? cash < order.total : m?.requires_reference ? reference.trim().length < 4 : false)}
            onClick={() =>
              start(async () => {
                const res = await recordPayment(order.id, method, m?.is_cash ? cash : null, reference);
                if (!res.ok) return setError(res.error);
                onDone(res.data.change);
              })
            }
          >
            {busy ? <Loader2 className="animate-spin" /> : null} Record payment
          </Button>
        </>
      }
    >
      {error ? <Alert tone="error" className="mb-3">{error}</Alert> : null}
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
          {cash > 0 ? <p className={cn("text-right font-bold", cash >= order.total ? "text-leaf-700" : "text-terracotta-600")}>{cash >= order.total ? `Change ${peso(cash - order.total)}` : `Short ${peso(order.total - cash)}`}</p> : null}
        </Field>
      ) : m?.requires_reference ? (
        <Field label="Reference number" htmlFor="pref">
          <Input id="pref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={60} />
        </Field>
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
