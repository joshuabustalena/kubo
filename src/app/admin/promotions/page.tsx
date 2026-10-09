import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { createClient } from "@/lib/supabase/server";
import { PromotionsManager, type Promo } from "./promotions-manager";

export const metadata: Metadata = { title: "Promotions" };

export default async function PromotionsPage() {
  const supabase = await createClient();
  const [{ data: promos }, { data: usage }] = await Promise.all([
    supabase.from("promotions").select("*").order("created_at", { ascending: false }),
    supabase.from("orders").select("promotion_id, discount_total").not("promotion_id", "is", null).neq("status", "cancelled"),
  ]);
  const used = new Map<string, { count: number; amount: number }>();
  for (const u of usage ?? []) {
    const cur = used.get(u.promotion_id!) ?? { count: 0, amount: 0 };
    used.set(u.promotion_id!, { count: cur.count + 1, amount: cur.amount + Number(u.discount_total) });
  }
  return (
    <div className="max-w-5xl">
      <PageHeader title="Promotions & discount codes" description="Codes customers enter at checkout or staff enter at the POS. Validated on the server for dates, channel and minimum order." />
      <PromotionsManager promos={((promos ?? []) as Promo[]).map((p) => ({ ...p, value: Number(p.value), min_subtotal: Number(p.min_subtotal), uses: used.get(p.id)?.count ?? 0, discounted: used.get(p.id)?.amount ?? 0 }))} />
    </div>
  );
}
