import type { Metadata } from "next";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getPaymentMethods, getStoreSettings } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import type { Category, Product } from "@/lib/types";
import { AutoRefresh } from "@/components/orders/auto-refresh";
import { Register } from "./register";

export const metadata: Metadata = { title: "Register" };

export default async function PosPage() {
  const user = (await getCurrentUser())!;
  const supabase = await createClient();
  const [cats, prods, links, methods, settings] = await Promise.all([
    supabase.from("categories").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("products").select("*").eq("is_archived", false).order("sort_order").order("name"),
    supabase.from("product_addons").select("product_id, addon_product_id"),
    getPaymentMethods("pos"),
    getStoreSettings(),
  ]);
  const products = ((prods.data ?? []) as Product[]).map((p) => ({ ...p, price: Number(p.price) }));
  return (
    <>
      <AutoRefresh seconds={15} />
      <Register
      categories={(cats.data ?? []) as Category[]}
      products={products}
      addonLinks={(links.data ?? []).map((l) => [l.product_id, l.addon_product_id] as [string, string])}
      methods={methods}
      packagingFee={settings.takeout_packaging_fee}
      maxDiscount={settings.max_staff_discount_percent}
      canDiscount={hasPermission(user, "apply_discount")}
      />
    </>
  );
}
