import { AlertTriangle, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { Stat } from "@/components/admin/stat";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { dateOnly, manilaToday, num, peso, UNIT_LABEL } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { InventoryItem } from "@/lib/types";

export const metadata: Metadata = { title: "Inventory" };

export default async function InventoryPage(props: PageProps<"/admin/inventory">) {
  const sp = await props.searchParams;
  const filter = typeof sp.filter === "string" ? sp.filter : "all";
  const supabase = await createClient();
  const [{ data }, { data: suppliers }] = await Promise.all([
    supabase.from("inventory_items").select("*").eq("is_archived", filter === "archived").order("category").order("name"),
    supabase.from("suppliers").select("id, name"),
  ]);
  const supplierName = new Map((suppliers ?? []).map((s) => [s.id, s.name]));
  let items = ((data ?? []) as InventoryItem[]).map((i) => ({ ...i, current_stock: Number(i.current_stock), min_stock: Number(i.min_stock), avg_cost: Number(i.avg_cost) }));
  const low = items.filter((i) => i.current_stock <= i.min_stock);
  if (filter === "low") items = low;
  const value = items.reduce((s, i) => s + Math.max(i.current_stock, 0) * i.avg_cost, 0);
  const soon = manilaToday();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Inventory"
        description="Ingredient-level stock. Sales deduct recipe quantities automatically; purchases and adjustments are logged as movements."
        actions={<><ButtonLink href="/admin/purchases/new" variant="wood">Record delivery</ButtonLink><ButtonLink href="/admin/inventory/new"><Plus /> New item</ButtonLink></>}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Items" value={items.length} />
        <Stat label="Stock value" value={peso(value)} hint="At weighted-average cost" />
        <Stat label="Low stock" value={low.length} tone={low.length ? "bad" : undefined} />
        <Stat label="Suppliers" value={(suppliers ?? []).length} hint={<Link className="underline" href="/admin/suppliers">Manage</Link>} />
      </div>
      <div className="flex gap-2">
        {[["all", "All active"], ["low", "Low stock"], ["archived", "Archived"]].map(([k, l]) => (
          <ButtonLink key={k} href={`/admin/inventory?filter=${k}`} size="sm" variant={filter === k ? "primary" : "outline"}>{l}</ButtonLink>
        ))}
      </div>
      <Card>
        <Table>
          <thead><tr><Th>Item</Th><Th>SKU</Th><Th className="text-right">In stock</Th><Th className="text-right">Minimum</Th><Th className="text-right">Avg cost</Th><Th className="text-right">Value</Th><Th>Supplier</Th><Th>Expires</Th></tr></thead>
          <tbody>
            {items.map((i) => {
              const isLow = i.current_stock <= i.min_stock;
              const expiring = i.expiration_date && i.expiration_date <= soon;
              return (
                <Tr key={i.id}>
                  <Td><Link href={`/admin/inventory/${i.id}`} className="font-semibold hover:underline">{i.name}</Link><br /><span className="text-xs text-ink-muted">{i.category}</span></Td>
                  <Td className="font-mono text-xs">{i.sku}</Td>
                  <Td className="text-right tabular-nums">
                    <span className={isLow ? "font-bold text-terracotta-600" : ""}>{isLow ? <AlertTriangle className="mr-1 inline size-3.5" /> : null}{num(i.current_stock, 3)} {UNIT_LABEL[i.unit]}</span>
                  </Td>
                  <Td className="text-right tabular-nums text-ink-muted">{num(i.min_stock, 3)}</Td>
                  <Td className="text-right tabular-nums">{peso(i.avg_cost)}/{UNIT_LABEL[i.unit]}</Td>
                  <Td className="text-right tabular-nums">{peso(Math.max(i.current_stock, 0) * i.avg_cost)}</Td>
                  <Td className="text-sm">{i.supplier_id ? supplierName.get(i.supplier_id) : "—"}</Td>
                  <Td>{i.expiration_date ? <Badge tone={expiring ? "red" : "neutral"}>{dateOnly(i.expiration_date)}</Badge> : "—"}</Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
