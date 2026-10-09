import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { Stat } from "@/components/admin/stat";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { dateTime, num, peso, UNIT_LABEL } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { InventoryItem, Supplier } from "@/lib/types";
import { AdjustForm } from "./adjust-form";
import { ItemForm } from "./item-form";

const MOVE_LABEL: Record<string, { label: string; tone: "green" | "red" | "neutral" | "gold" | "blue" }> = {
  opening: { label: "Opening", tone: "blue" },
  purchase: { label: "Purchase", tone: "green" },
  sale: { label: "Sale", tone: "neutral" },
  sale_reversal: { label: "Returned", tone: "gold" },
  adjustment: { label: "Adjustment", tone: "gold" },
  spoilage: { label: "Spoilage", tone: "red" },
  count: { label: "Count", tone: "blue" },
};

export default async function InventoryItemPage(props: PageProps<"/admin/inventory/[id]">) {
  const { id } = await props.params;
  const isNew = id === "new";
  const supabase = await createClient();
  const [{ data: item }, { data: suppliers }, { data: moves }] = await Promise.all([
    isNew ? Promise.resolve({ data: null }) : supabase.from("inventory_items").select("*").eq("id", id).maybeSingle(),
    supabase.from("suppliers").select("*").eq("is_active", true).order("name"),
    isNew ? Promise.resolve({ data: [] }) : supabase.from("inventory_movements").select("*, orders(order_number), purchase_orders(po_number), profiles:created_by(full_name)").eq("inventory_item_id", id).order("created_at", { ascending: false }).limit(150),
  ]);
  if (!isNew && !item) notFound();
  const i = item as InventoryItem | null;

  return (
    <div className="space-y-5">
      <Link href="/admin/inventory" className="inline-flex items-center gap-1.5 text-sm font-semibold text-forest-700 hover:underline"><ArrowLeft className="size-4" /> Inventory</Link>
      <PageHeader title={i ? i.name : "New inventory item"} description={i ? `${i.sku} · stock unit: ${UNIT_LABEL[i.unit]}` : "Stock levels only change through movements, so add opening stock here or record a delivery."} />
      {i ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="In stock" value={`${num(i.current_stock, 3)} ${UNIT_LABEL[i.unit]}`} tone={Number(i.current_stock) <= Number(i.min_stock) ? "bad" : undefined} hint={`Minimum ${num(i.min_stock, 3)}`} />
          <Stat label="Weighted avg cost" value={peso(i.avg_cost)} hint={`per ${UNIT_LABEL[i.unit]}`} />
          <Stat label="Last purchase cost" value={peso(i.last_purchase_cost)} hint={`per ${UNIT_LABEL[i.unit]}`} />
          <Stat label="Stock value" value={peso(Math.max(Number(i.current_stock), 0) * Number(i.avg_cost))} />
        </div>
      ) : null}
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Details" />
          <CardBody><ItemForm item={i} suppliers={(suppliers ?? []) as Supplier[]} /></CardBody>
        </Card>
        {i ? (
          <Card>
            <CardHeader title="Record a stock change" description="Spoilage, corrections and physical counts are logged with your name." />
            <CardBody><AdjustForm itemId={i.id} unit={i.unit} current={Number(i.current_stock)} /></CardBody>
          </Card>
        ) : null}
      </div>
      {i ? (
        <Card>
          <CardHeader title="Stock movement history" description="Newest first. Balance and average cost after each movement." />
          <Table>
            <thead><tr><Th>When</Th><Th>Type</Th><Th className="text-right">Change</Th><Th className="text-right">Unit cost</Th><Th className="text-right">Balance</Th><Th className="text-right">Avg cost after</Th><Th>Reference</Th></tr></thead>
            <tbody>
              {(moves ?? []).map((m) => {
                const t = MOVE_LABEL[m.movement_type] ?? { label: m.movement_type, tone: "neutral" as const };
                const ref = (m.orders as { order_number: string } | null)?.order_number ?? (m.purchase_orders as { po_number: string } | null)?.po_number;
                return (
                  <Tr key={m.id}>
                    <Td className="whitespace-nowrap">{dateTime(m.created_at)}</Td>
                    <Td><Badge tone={t.tone}>{t.label}</Badge></Td>
                    <Td className={`text-right tabular-nums font-semibold ${Number(m.quantity) < 0 ? "text-terracotta-600" : "text-leaf-700"}`}>{Number(m.quantity) > 0 ? "+" : ""}{num(m.quantity, 4)}</Td>
                    <Td className="text-right tabular-nums">{peso(m.unit_cost)}</Td>
                    <Td className="text-right tabular-nums">{num(m.balance_after, 3)}</Td>
                    <Td className="text-right tabular-nums">{peso(m.avg_cost_after)}</Td>
                    <Td className="text-sm">
                      {m.order_id && ref ? <Link className="underline" href={`/admin/orders/${m.order_id}`}>{ref}</Link> : m.purchase_order_id && ref ? <Link className="underline" href={`/admin/purchases/${m.purchase_order_id}`}>{ref}</Link> : null}
                      {m.notes && !m.order_id ? <span className="text-ink-muted"> {m.notes}</span> : null}
                      {(m.profiles as { full_name: string } | null)?.full_name ? <span className="block text-xs text-ink-muted">by {(m.profiles as { full_name: string }).full_name}</span> : null}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      ) : null}
    </div>
  );
}
