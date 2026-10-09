import { ClipboardList } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AutoRefresh } from "@/components/orders/auto-refresh";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { manilaToday, peso, relativeMinutes, SERVICE_LABEL, timeOnly } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { QuickAdvance } from "./quick-advance";

export const metadata: Metadata = { title: "Orders" };

const COLUMNS = [
  { status: "pending", title: "New" },
  { status: "confirmed", title: "Confirmed" },
  { status: "preparing", title: "Preparing" },
  { status: "ready", title: "Ready" },
] as const;

export default async function PosOrdersPage() {
  const supabase = await createClient();
  const startOfDay = new Date(`${manilaToday()}T00:00:00+08:00`).toISOString();
  const [{ data: open }, { data: closed }] = await Promise.all([
    supabase
      .from("orders")
      .select("id, order_number, channel, status, payment_status, service_type, total, customer_name, notes, created_at, order_items(quantity, product_name, parent_item_id, notes)")
      .in("status", ["pending", "confirmed", "preparing", "ready"])
      .order("created_at"),
    supabase
      .from("orders")
      .select("id, order_number, status, payment_status, total, customer_name, completed_at, cancelled_at, created_at")
      .in("status", ["completed", "cancelled"])
      .gte("created_at", startOfDay)
      .order("updated_at", { ascending: false })
      .limit(40),
  ]);

  return (
    <div className="p-3 sm:p-4">
      <AutoRefresh seconds={10} />
      <div className="mb-3 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-wood-800">Order queue</h1>
        <p className="text-xs text-ink-muted">Refreshes every 10 seconds</p>
      </div>
      {!open?.length ? (
        <div className="paper"><EmptyState icon={<ClipboardList />} title="No open orders">New online and POS orders will appear here.</EmptyState></div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => {
            const list = (open ?? []).filter((o) => o.status === col.status);
            return (
              <section key={col.status} className="rounded-2xl bg-cream-200/50 p-2">
                <h2 className="flex items-center justify-between px-2 py-1 font-display text-lg font-bold text-wood-700">
                  {col.title} <span className="rounded-full bg-cream-50 px-2 text-sm">{list.length}</span>
                </h2>
                <ul className="space-y-2">
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
                      <QuickAdvance orderId={o.id} status={o.status} paid={o.payment_status === "paid"} />
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
