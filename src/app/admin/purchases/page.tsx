import { Plus, ShoppingCart } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DateRangeFilter } from "@/components/admin/date-range";
import { PageHeader } from "@/components/admin/page-header";
import { Stat } from "@/components/admin/stat";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { dateRange } from "@/lib/admin";
import { dateOnly, peso } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Purchases" };

const TONE = { draft: "neutral", ordered: "gold", received: "green", cancelled: "red" } as const;

export default async function PurchasesPage(props: PageProps<"/admin/purchases">) {
  const sp = await props.searchParams;
  const { from, to } = dateRange(sp, 60);
  const supabase = await createClient();
  const { data } = await supabase
    .from("purchase_orders")
    .select("*, suppliers(name), purchase_order_items(id)")
    .gte("order_date", from)
    .lte("order_date", to)
    .order("order_date", { ascending: false })
    .order("created_at", { ascending: false });
  const received = (data ?? []).filter((p) => p.status === "received");
  return (
    <div className="space-y-5">
      <PageHeader title="Purchases & deliveries" description="Receiving a purchase adds stock and updates weighted-average costs." actions={<ButtonLink href="/admin/purchases/new"><Plus /> New purchase</ButtonLink>} />
      <DateRangeFilter from={from} to={to} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Received spend" value={peso(received.reduce((s, p) => s + Number(p.total_cost), 0))} hint={`${received.length} deliveries`} />
        <Stat label="Awaiting delivery" value={(data ?? []).filter((p) => p.status === "ordered").length} />
      </div>
      <Card>
        {!data?.length ? <EmptyState icon={<ShoppingCart />} title="No purchases in this range" /> : (
          <Table>
            <thead><tr><Th>PO</Th><Th>Date</Th><Th>Supplier</Th><Th>Items</Th><Th className="text-right">Total</Th><Th>Status</Th></tr></thead>
            <tbody>
              {data.map((p) => (
                <Tr key={p.id}>
                  <Td><Link href={`/admin/purchases/${p.id}`} className="font-mono font-semibold hover:underline">{p.po_number}</Link></Td>
                  <Td>{dateOnly(p.order_date)}</Td>
                  <Td>{(p.suppliers as { name: string } | null)?.name ?? "—"}</Td>
                  <Td>{(p.purchase_order_items as unknown[]).length}</Td>
                  <Td className="text-right tabular-nums">{peso(p.total_cost)}</Td>
                  <Td><Badge tone={TONE[p.status as keyof typeof TONE]}>{p.status}</Badge></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
