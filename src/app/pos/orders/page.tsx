import { ClipboardList } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AutoRefresh } from "@/components/orders/auto-refresh";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { manilaToday, peso, relativeMinutes, SERVICE_LABEL, timeOnly } from "@/lib/format";
import { getPaymentMethods } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { QuickAdvance } from "./quick-advance";

export const metadata: Metadata = { title: "Orders" };

export default async function PosOrdersPage() {
  const supabase = await createClient();
  const startOfDay = new Date(`${manilaToday()}T00:00:00+08:00`).toISOString();
  const [{ data: open }, { data: closed }, methods] = await Promise.all([
    supabase
      .from("orders")
      .select("id, order_number, channel, status, payment_status, service_type, subtotal, packaging_fee, discount_total, discount_reason, total, customer_name, notes, created_at, order_items(id, quantity, product_name, unit_price, line_total, parent_item_id, notes)")
      .in("status", ["pending", "confirmed", "preparing", "ready"])
      .eq("channel", "online") // POS sales are completed at the register; only online orders wait here
      .order("created_at"),
    supabase
      .from("orders")
      .select("id, order_number, status, payment_status, total, customer_name, completed_at, cancelled_at, created_at")
      .in("status", ["completed", "cancelled"])
      .gte("created_at", startOfDay)
      .order("updated_at", { ascending: false })
      .limit(40),
    getPaymentMethods("pos"),
  ]);

  return (
    <div className="p-3 sm:p-4">
      <AutoRefresh seconds={10} />
      <div className="mb-3 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-wood-800">Order queue</h1>
        <p className="text-xs text-ink-muted">Refreshes every 10 seconds</p>
      </div>
      <h2 className="mb-2 flex items-center gap-2 font-display text-xl font-bold text-wood-800">
        Waiting for payment <span className="rounded-full bg-gold-100 px-2.5 text-sm text-gold-700">{(open ?? []).length}</span>
      </h2>
      {!open?.length ? (
        <div className="paper"><EmptyState icon={<ClipboardList />} title="No orders waiting">Online orders show up here until the customer pays at the counter.</EmptyState></div>
      ) : (
        <div>
          {[0].map((col) => {
            const list = open ?? [];
            return (
              <section key={col}>
                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {list.map((o) => (
                    <li key={o.id} className="paper p-3">
                      <Link href={`/pos/orders/${o.id}`} className="block">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-display text-lg font-bold leading-none text-wood-800">{o.order_number.slice(-4)}</p>
                            <p className="text-xs text-ink-muted">{o.order_number} · {o.channel === "online" ? "Online" : "Walk-in"}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold">{peso(o.total)}</p>
                            <p className="text-xs text-ink-muted">{relativeMinutes(o.created_at)}</p>
                          </div>
                        </div>
                        <p className="mt-1 text-sm font-semibold">{o.customer_name || "Walk-in"} · {SERVICE_LABEL[o.service_type]}</p>
                        <ul className="mt-1 text-sm">
                          {(o.order_items as { quantity: number; product_name: string; parent_item_id: string | null; notes: string }[]).map((i, idx) => (
                            <li key={idx} className={i.parent_item_id ? "pl-3 text-xs text-ink-muted" : ""}>
                              {i.parent_item_id ? "+ " : ""}{i.quantity}× {i.product_name}{i.notes ? <em className="text-ink-muted"> — {i.notes}</em> : null}
                            </li>
                          ))}
                        </ul>
                        {o.notes ? <p className="mt-1 rounded bg-gold-100 px-2 py-1 text-xs">{o.notes}</p> : null}
                        <div className="mt-2"><PaymentStatusBadge status={o.payment_status} /></div>
                      </Link>
                      <QuickAdvance
                        orderId={o.id}
                        paid={o.payment_status === "paid"}
                        methods={methods}
                        bill={{
                          items: (o.order_items as { id: string; quantity: number; product_name: string; unit_price: number; line_total: number; parent_item_id: string | null }[]).map((i) => ({ ...i, unit_price: Number(i.unit_price), line_total: Number(i.line_total) })),
                          subtotal: Number(o.subtotal),
                          packaging_fee: Number(o.packaging_fee),
                          discount_total: Number(o.discount_total),
                          discount_reason: o.discount_reason,
                          total: Number(o.total),
                        }}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <h2 className="mb-2 mt-6 font-display text-xl font-bold text-wood-800">Closed today</h2>
      <div className="paper divide-y divide-bamboo-300/40">
        {(closed ?? []).length === 0 ? <p className="p-4 text-sm text-ink-muted">Nothing closed yet today.</p> : null}
        {(closed ?? []).map((o) => (
          <Link key={o.id} href={`/pos/orders/${o.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 hover:bg-cream-200/50">
            <span className="font-semibold">{o.order_number} <span className="text-sm font-normal text-ink-muted">{o.customer_name}</span></span>
            <span className="flex items-center gap-2 text-sm">
              {timeOnly(o.completed_at ?? o.cancelled_at ?? o.created_at)} <OrderStatusBadge status={o.status} /> <b>{peso(o.total)}</b>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
