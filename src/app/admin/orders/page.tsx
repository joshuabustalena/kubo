import { ClipboardList } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DateRangeFilter } from "@/components/admin/date-range";
import { PageHeader } from "@/components/admin/page-header";
import { PrintButton } from "@/components/admin/report-section";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { dateRange } from "@/lib/admin";
import { dateTime, peso, SERVICE_LABEL } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Orders" };
const STATUSES = ["all", "pending", "confirmed", "preparing", "ready", "completed", "cancelled"];

export default async function AdminOrdersPage(props: PageProps<"/admin/orders">) {
  const sp = await props.searchParams;
  const { from, to } = dateRange(sp, 7);
  const status = typeof sp.status === "string" && STATUSES.includes(sp.status) ? sp.status : "all";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 40) : "";
  const supabase = await createClient();
  let query = supabase
    .from("orders")
    .select("id, order_number, channel, status, payment_status, service_type, total, refunded_total, customer_name, created_at, is_demo")
    .gte("created_at", new Date(`${from}T00:00:00+08:00`).toISOString())
    .lt("created_at", new Date(new Date(`${to}T00:00:00+08:00`).getTime() + 86400000).toISOString())
    .order("created_at", { ascending: false })
    .limit(300);
  if (status !== "all") query = query.eq("status", status);
  if (q) query = query.or(`order_number.ilike.%${q.replace(/[%,()]/g, "")}%,customer_name.ilike.%${q.replace(/[%,()]/g, "")}%`);
  const { data: orders } = await query;
  const base = `/admin/orders?from=${from}&to=${to}`;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Orders & refunds"
        description="Every online and walk-in order. Open one to update status, verify payment, void or refund."
        actions={<PrintButton />}
      />
      <DateRangeFilter from={from} to={to} />
      <div className="flex flex-wrap items-center gap-2">
        {STATUSES.map((s) => (
          <ButtonLink key={s} size="sm" variant={status === s ? "primary" : "outline"} href={`${base}&status=${s}${q ? `&q=${encodeURIComponent(q)}` : ""}`}>{s === "all" ? "All" : s[0].toUpperCase() + s.slice(1)}</ButtonLink>
        ))}
        <form className="ml-auto" action="/admin/orders">
          <input type="hidden" name="from" value={from} /><input type="hidden" name="to" value={to} /><input type="hidden" name="status" value={status} />
          <input name="q" defaultValue={q} placeholder="Order # or name" className="h-9 rounded-xl border border-bamboo-400/70 bg-white/80 px-3 text-sm" aria-label="Search orders" />
        </form>
      </div>
      <Card>
        {!orders?.length ? <EmptyState icon={<ClipboardList />} title="No orders match" /> : (
          <Table>
            <thead><tr><Th>Order</Th><Th>Placed</Th><Th>Customer</Th><Th>Type</Th><Th>Status</Th><Th>Payment</Th><Th className="text-right">Total</Th></tr></thead>
            <tbody>
              {orders.map((o) => (
                <Tr key={o.id}>
                  <Td><Link href={`/admin/orders/${o.id}`} className="font-mono font-semibold hover:underline">{o.order_number}</Link>{o.is_demo ? <span className="ml-1 text-xs text-ink-muted">demo</span> : null}</Td>
                  <Td className="whitespace-nowrap">{dateTime(o.created_at)}</Td>
                  <Td>{o.customer_name || "Walk-in"}</Td>
                  <Td className="text-sm">{o.channel === "online" ? "Online" : "POS"} · {SERVICE_LABEL[o.service_type]}</Td>
                  <Td><OrderStatusBadge status={o.status} /></Td>
                  <Td><PaymentStatusBadge status={o.payment_status} /></Td>
                  <Td className="text-right tabular-nums">{peso(o.total)}{Number(o.refunded_total) > 0 ? <span className="block text-xs text-terracotta-600">−{peso(o.refunded_total)}</span> : null}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
