import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { createClient } from "@/lib/supabase/server";
import type { Supplier } from "@/lib/types";
import { SupplierList } from "./supplier-list";

export const metadata: Metadata = { title: "Suppliers" };

export default async function SuppliersPage() {
  const supabase = await createClient();
  const [{ data: suppliers }, { data: pos }, { data: items }] = await Promise.all([
    supabase.from("suppliers").select("*").order("name"),
    supabase.from("purchase_orders").select("supplier_id, total_cost").eq("status", "received"),
    supabase.from("inventory_items").select("supplier_id").eq("is_archived", false),
  ]);
  const spend = new Map<string, number>();
  for (const p of pos ?? []) if (p.supplier_id) spend.set(p.supplier_id, (spend.get(p.supplier_id) ?? 0) + Number(p.total_cost));
  const count = new Map<string, number>();
  for (const i of items ?? []) if (i.supplier_id) count.set(i.supplier_id, (count.get(i.supplier_id) ?? 0) + 1);
  return (
    <div className="max-w-5xl">
      <PageHeader title="Suppliers" description="Who you buy from, and how much you've spent with each." />
      <SupplierList suppliers={((suppliers ?? []) as Supplier[]).map((s) => ({ ...s, spend: spend.get(s.id) ?? 0, items: count.get(s.id) ?? 0 }))} />
    </div>
  );
}
