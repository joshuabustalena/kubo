import { OrderStatusBadge, PaymentStatusBadge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { dateTime, ORDER_STATUS_LABEL, peso, SERVICE_LABEL } from "@/lib/format";
import { groupItems, type OrderDetail } from "@/lib/orders";

/** Read-only order details used by the POS and admin order pages. */
export function OrderSummary({ order, showCost = false }: { order: OrderDetail; showCost?: boolean }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <Card>
        <CardHeader
          title={`Order ${order.order_number}`}
          description={`${dateTime(order.created_at)} · ${order.channel === "online" ? "Online" : "Walk-in (POS)"} · ${SERVICE_LABEL[order.service_type]}`}
          action={<><OrderStatusBadge status={order.status} /><PaymentStatusBadge status={order.payment_status} /></>}
        />
        <CardBody>
          <ul className="divide-y divide-bamboo-300/40">
            {groupItems(order.items).map((i) => (
              <li key={i.id} className="py-2">
                <div className="flex justify-between gap-3">
                  <span className="font-semibold">{i.quantity} × {i.product_name}{i.refunded_quantity ? <span className="ml-2 text-xs text-terracotta-600">({i.refunded_quantity} refunded)</span> : null}</span>
                  <span>{peso(i.line_total)}</span>
                </div>
                {i.addons.map((a) => (
                  <div key={a.id} className="flex justify-between pl-4 text-sm text-ink-muted"><span>+ {a.quantity} × {a.product_name}</span><span>{peso(a.line_total)}</span></div>
                ))}
                {i.notes ? <p className="pl-4 text-sm italic text-ink-muted">“{i.notes}”</p> : null}
                {showCost ? <p className="pl-4 text-xs text-ink-muted">Cost snapshot {peso(i.unit_cost)} / serving · {i.points_per_unit} pts each</p> : null}
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-1 border-t border-bamboo-300/50 pt-3 text-sm">
            <div className="flex justify-between"><dt>Subtotal</dt><dd>{peso(order.subtotal)}</dd></div>
            {order.packaging_fee > 0 ? <div className="flex justify-between"><dt>Packaging</dt><dd>{peso(order.packaging_fee)}</dd></div> : null}
            {order.discount_total > 0 ? <div className="flex justify-between text-leaf-700"><dt>Discount ({order.discount_reason})</dt><dd>−{peso(order.discount_total)}</dd></div> : null}
            <div className="flex justify-between text-base font-bold"><dt>Total</dt><dd>{peso(order.total)}</dd></div>
            {order.refunded_total > 0 ? <div className="flex justify-between text-terracotta-600"><dt>Refunded / voided</dt><dd>−{peso(order.refunded_total)}</dd></div> : null}
          </dl>
          {order.notes ? <p className="mt-3 rounded-lg bg-gold-100 p-3 text-sm">Note: {order.notes}</p> : null}
        </CardBody>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardHeader title="Details" />
          <CardBody className="space-y-1.5 text-sm">
            <p><span className="text-ink-muted">Customer:</span> {order.customer_name || "Walk-in"}{order.customer_id ? " (account)" : ""}</p>
            {order.staff_name ? <p><span className="text-ink-muted">Cashier:</span> {order.staff_name}</p> : null}
            {order.payment_method_name ? <p><span className="text-ink-muted">Payment method:</span> {order.payment_method_name}</p> : null}
            {order.points_earned ? <p><span className="text-ink-muted">Points (net):</span> {order.points_earned}</p> : null}
            {order.cancel_reason ? <p><span className="text-ink-muted">Cancel reason:</span> {order.cancel_reason}</p> : null}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Payments & refunds" />
          <CardBody className="space-y-2 text-sm">
            {order.payments.length === 0 && order.refunds.length === 0 ? <p className="text-ink-muted">No payment yet.</p> : null}
            {order.payments.map((p) => (
              <div key={p.id} className="flex justify-between gap-2">
                <span>{p.method_code.toUpperCase()} {p.reference_no ? <span className="font-mono text-xs">#{p.reference_no}</span> : null}<br /><span className="text-xs text-ink-muted">{p.status}{p.amount_tendered ? ` · received ${peso(p.amount_tendered)}, change ${peso(p.change_given)}` : ""}</span></span>
                <span className="font-semibold">{peso(p.amount)}</span>
              </div>
            ))}
            {order.refunds.map((r) => (
              <div key={r.id} className="flex justify-between gap-2 text-terracotta-600">
                <span>{r.kind === "void" ? "Void" : "Refund"}: {r.reason}<br /><span className="text-xs">{dateTime(r.created_at)}{r.restocked ? " · restocked" : ""}{r.points_reversed ? ` · −${r.points_reversed} pts` : ""}</span></span>
                <span className="font-semibold">−{peso(r.amount)}</span>
              </div>
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Status history" />
          <CardBody>
            <ol className="space-y-1.5 text-sm">
              {order.history.map((h) => (
                <li key={h.id} className="flex justify-between gap-2">
                  <span>{ORDER_STATUS_LABEL[h.to_status]}{h.note ? <span className="text-ink-muted"> — {h.note}</span> : null}</span>
                  <span className="shrink-0 text-ink-muted">{dateTime(h.created_at)}</span>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
