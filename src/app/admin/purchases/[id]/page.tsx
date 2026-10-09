import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { dateOnly, dateTime, num, peso } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { PurchaseActions } from "./purchase-actions";

export default async function PurchasePage(props: PageProps<"/admin/purchases/[id]">) {
  const { id } = await props.params;
  const supabase = await createClient();
  const { data: po } = await supabase
    .from("purchase_orders")
    .select("*, suppliers(name), purchase_order_items(*, inventory_items(name, sku, unit))")
    .eq("id", id)
    .maybeSingle();
  if (!po) notFound();
  const lines = po.purchase_order_items as { id: string; quantity: number; unit: string; unit_cost: number; line_total: number; expiration_date: string | null; inventory_item_id: string; inventory_items: { name: string; sku: string; unit: string } }[];
  return (
    <div className="max-w-4xl space-y-5">
      <Link href="/admin/purchases" className="inline-flex items-center gap-1.5 text-sm font-semibold text-forest-700 hover:underline"><ArrowLeft className="size-4" /> Purchases</Link>
      <PageHeader
        title={po.po_number}
        description={`${(po.suppliers as { name: string } | null)?.name ?? "No supplier"} · ${dateOnly(po.order_date)}${po.received_at ? ` · received ${dateTime(po.received_at)}` : ""}`}
        actions={<Badge tone={po.status === "received" ? "green" : po.status === "cancelled" ? "red" : "gold"}>{po.status}</Badge>}
      />
      {po.status === "ordered" ? <PurchaseActions id={po.id} /> : null}
      <Card>
        <Table>
          <thead><tr><Th>Item</Th><Th className="text-right">Quantity</Th><Th className="text-right">Unit cost</Th><Th className="text-right">Line total</Th><Th>Expiry</Th></tr></thead>
          <tbody>
            {lines.map((l) => (
              <Tr key={l.id}>
                <Td><Link href={`/admin/inventory/${l.inventory_item_id}`} className="font-semibold hover:underline">{l.inventory_items.name}</Link></Td>
                <Td className="text-right tabular-nums">{num(l.quantity, 3)} {l.unit}</Td>
                <Td className="text-right tabular-nums">{peso(l.unit_cost)}/{l.unit}</Td>
                <Td className="text-right tabular-nums">{peso(l.line_total)}</Td>
                <Td>{l.expiration_date ? dateOnly(l.expiration_date) : "—"}</Td>
              </Tr>
            ))}
            <Tr><Td colSpan={3} className="font-bold">Total</Td><Td className="text-right font-bold tabular-nums">{peso(po.total_cost)}</Td><Td /></Tr>
          </tbody>
        </Table>
        {po.notes ? <CardBody className="whitespace-pre-line text-sm text-ink-muted">{po.notes}</CardBody> : null}
      </Card>
    </div>
  );
}
