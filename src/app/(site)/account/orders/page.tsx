import { ClipboardList } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { requireUser } from "@/lib/auth";
import { dateTime, peso, SERVICE_LABEL } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My orders" };

export default async function MyOrdersPage() {
  const user = await requireUser("/account/orders");
  const supabase = await createClient();
  const { data: orders } = await supabase
    .from("orders")
    .select("id, order_number, status, payment_status, total, service_type, created_at, order_items(quantity, product_name, parent_item_id)")
    .eq("customer_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (!orders?.length) {
    return (
      <div className="paper">
        <EmptyState icon={<ClipboardList />} title="No orders yet" action={<ButtonLink href="/menu">Order your first meal</ButtonLink>}>
          Your online and counter orders linked to this account will appear here.
        </EmptyState>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {orders.map((o) => (
        <li key={o.id}>
          <Link href={`/orders/${o.id}`} className="paper flex flex-wrap items-center justify-between gap-3 p-4 hover:shadow-[var(--shadow-lift)]">
            <div className="min-w-0">
              <p className="font-display text-lg font-bold text-wood-800">{o.order_number}</p>
              <p className="text-sm text-ink-muted">{dateTime(o.created_at)} · {SERVICE_LABEL[o.service_type]}</p>
              <p className="mt-1 truncate text-sm">
                {(o.order_items as { quantity: number; product_name: string; parent_item_id: string | null }[])
                  .filter((i) => !i.parent_item_id)
                  .map((i) => `${i.quantity}× ${i.product_name}`)
                  .join(", ")}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <span className="font-display text-xl font-extrabold text-forest-700">{peso(o.total)}</span>
              <div className="flex gap-1.5">
                <OrderStatusBadge status={o.status} />
                <PaymentStatusBadge status={o.payment_status} />
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
