import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { manilaToday } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { PurchaseForm } from "./purchase-form";

export const metadata: Metadata = { title: "New purchase" };

export default async function NewPurchasePage() {
  const supabase = await createClient();
  const [{ data: items }, { data: suppliers }] = await Promise.all([
    supabase.from("inventory_items").select("id, name, sku, unit, last_purchase_cost, supplier_id").eq("is_archived", false).order("name"),
    supabase.from("suppliers").select("id, name").eq("is_active", true).order("name"),
  ]);
  return (
    <div className="max-w-5xl">
      <Link href="/admin/purchases" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-forest-700 hover:underline"><ArrowLeft className="size-4" /> Purchases</Link>
      <PageHeader title="Record a purchase" description="Enter what you bought and what you paid per unit. You can buy in a different unit than you stock (e.g. buy kg, stock g)." />
      <PurchaseForm today={manilaToday()} items={(items ?? []).map((i) => ({ ...i, last_purchase_cost: Number(i.last_purchase_cost) }))} suppliers={suppliers ?? []} />
    </div>
  );
}
