import { PartyPopper, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/orders/auto-refresh";
import { OrderTimeline } from "@/components/orders/order-timeline";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { requireUser } from "@/lib/auth";
import { dateTime, peso, SERVICE_LABEL } from "@/lib/format";
import { getOrderDetail, groupItems } from "@/lib/orders";
import { CancelOrderButton } from "./cancel-button";

export const metadata: Metadata = { title: "Order status" };

export default async function OrderTrackingPage(props: PageProps<"/orders/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  await requireUser(`/orders/${id}`);
  const order = await getOrderDetail(id);
  if (!order) notFound();
  const open = !["completed", "cancelled"].includes(order.status);
  const pendingPayment = order.payments.find((p) => p.status === "pending");

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <AutoRefresh enabled={open} seconds={15} />
      {sp.placed ? (
        <Alert tone="success" className="mb-5" title="Salamat! Your order is in.">
          Show order number <b>{order.order_number}</b> at the counter. This page updates on its own.
        </Alert>
      ) : null}

      <div className="paper overflow-hidden">
        <div className="woven flex flex-wrap items-end justify-between gap-3 px-5 py-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-wood-600">Order number</p>
            <h1 className="font-display text-4xl font-extrabold text-forest-800">{order.order_number}</h1>
            <p className="text-sm text-ink-soft">{dateTime(order.created_at)} · {SERVICE_LABEL[order.service_type]}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <OrderStatusBadge status={order.status} />
            <PaymentStatusBadge status={order.payment_status} />
          </div>
        </div>
        <div className="p-5">
          <OrderTimeline status={order.status} history={order.history} />

          {order.status === "ready" ? (
            <Alert tone="success" className="mt-5" title="Your food is ready!">
              Head to the counter{order.payment_status !== "paid" ? ` and pay ${peso(order.total)}` : ""}.
            </Alert>
          ) : null}
          {pendingPayment ? (
            <Alert tone="warning" className="mt-5" title="We're verifying your payment">
              Reference {pendingPayment.reference_no}. We&apos;ll start your order once it&apos;s confirmed.
            </Alert>
          ) : null}
          {order.payment_status === "unpaid" && order.status !== "cancelled" && order.payments.some((p) => p.status === "rejected") ? (
            <Alert tone="error" className="mt-5" title="We couldn't verify your payment">Please pay at the counter or contact us.</Alert>
          ) : null}
          {order.status === "cancelled" && order.cancel_reason ? (
            <p className="mt-3 text-sm text-ink-muted">Reason: {order.cancel_reason}</p>
          ) : null}

          <h2 className="mt-6 font-display text-xl font-bold text-wood-800">Items</h2>
          <ul className="mt-2 divide-y divide-bamboo-300/40">
            {groupItems(order.items).map((i) => (
              <li key={i.id} className="py-2.5">
                <div className="flex justify-between gap-3">
                  <span className="font-semibold">{i.quantity} × {i.product_name}</span>
                  <span>{peso(i.line_total)}</span>
                </div>
                {i.addons.map((a) => (
                  <div key={a.id} className="flex justify-between gap-3 pl-4 text-sm text-ink-muted">
                    <span>+ {a.quantity} × {a.product_name}</span>
                    <span>{peso(a.line_total)}</span>
                  </div>
                ))}
                {i.notes ? <p className="pl-4 text-sm italic text-ink-muted">“{i.notes}”</p> : null}
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-1 border-t border-bamboo-300/50 pt-3 text-sm">
            <div className="flex justify-between"><dt>Subtotal</dt><dd>{peso(order.subtotal)}</dd></div>
            {order.packaging_fee > 0 ? <div className="flex justify-between"><dt>Takeout packaging</dt><dd>{peso(order.packaging_fee)}</dd></div> : null}
            {order.discount_total > 0 ? <div className="flex justify-between text-leaf-700"><dt>Discount {order.discount_reason ? `(${order.discount_reason})` : ""}</dt><dd>−{peso(order.discount_total)}</dd></div> : null}
            <div className="flex justify-between text-lg font-bold"><dt>Total</dt><dd className="font-display text-xl text-forest-700">{peso(order.total)}</dd></div>
            {order.refunded_total > 0 ? <div className="flex justify-between text-terracotta-600"><dt>Refunded</dt><dd>−{peso(order.refunded_total)}</dd></div> : null}
            {order.payment_method_name ? <div className="flex justify-between text-ink-muted"><dt>Payment</dt><dd>{order.payment_method_name}</dd></div> : null}
          </dl>
          {order.notes ? <p className="mt-3 rounded-lg bg-cream-200/60 p-3 text-sm">Note: {order.notes}</p> : null}

          {order.points_earned > 0 ? (
            <p className="mt-4 flex items-center gap-2 rounded-lg bg-gold-100 px-3 py-2 text-sm font-semibold text-gold-700">
              <PartyPopper className="size-4" /> You earned {order.points_earned} points{order.tokens_earned > 0 ? ` and ${order.tokens_earned} game token${order.tokens_earned === 1 ? "" : "s"}` : ""} on this order.
            </p>
          ) : open ? (
            <p className="mt-4 flex items-center gap-2 text-sm text-ink-muted">
              <Sparkles className="size-4" /> Points are added when your order is completed and paid.
            </p>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href="/account/orders" variant="outline">All my orders</ButtonLink>
            <ButtonLink href="/menu" variant="ghost">Order more</ButtonLink>
            {order.status === "pending" && order.payment_status === "unpaid" ? <CancelOrderButton orderId={order.id} /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
