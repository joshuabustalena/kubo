import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Category, PaymentMethod, Product, Reward, StoreSettings } from "@/lib/types";

export const getStoreSettings = cache(async (): Promise<StoreSettings> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("store_settings").select("*").single();
  if (error) throw new Error(`Could not load store settings: ${error.message}`);
  return {
    ...data,
    takeout_packaging_fee: Number(data.takeout_packaging_fee),
    points_price_threshold: Number(data.points_price_threshold),
    max_staff_discount_percent: Number(data.max_staff_discount_percent),
  } as StoreSettings;
});

export type MenuProduct = Product & { addons: Pick<Product, "id" | "name" | "price" | "is_available" | "points_eligible" | "track_stock" | "stock_quantity">[] };
export type Menu = { categories: Category[]; products: MenuProduct[] };

/** Public menu: active categories, non-archived products and their add-ons. */
export const getMenu = cache(async (): Promise<Menu> => {
  const supabase = await createClient();
  const [cats, prods, links] = await Promise.all([
    supabase.from("categories").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("products").select("*").eq("is_archived", false).order("sort_order").order("name"),
    supabase.from("product_addons").select("product_id, addon_product_id"),
  ]);
  if (cats.error) throw new Error(cats.error.message);
  if (prods.error) throw new Error(prods.error.message);
  const categories = (cats.data ?? []) as Category[];
  const activeCats = new Set(categories.map((c) => c.id));
  const all = ((prods.data ?? []) as Product[]).map((p) => ({ ...p, price: Number(p.price) }));
  const byId = new Map(all.map((p) => [p.id, p]));
  const products: MenuProduct[] = all
    .filter((p) => activeCats.has(p.category_id))
    .map((p) => ({
      ...p,
      addons: (links.data ?? [])
        .filter((l) => l.product_id === p.id)
        .map((l) => byId.get(l.addon_product_id))
        .filter((a): a is Product => Boolean(a))
        .map((a) => ({ id: a.id, name: a.name, price: a.price, is_available: a.is_available, points_eligible: a.points_eligible, track_stock: a.track_stock, stock_quantity: a.stock_quantity })),
    }));
  return { categories, products };
});

export const getPaymentMethods = cache(async (channel: "online" | "pos"): Promise<PaymentMethod[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payment_methods")
    .select("*")
    .eq("is_active", true)
    .eq(channel === "online" ? "allow_online" : "allow_pos", true)
    .order("sort_order");
  return (data ?? []) as PaymentMethod[];
});

export const getActivePromotions = cache(async () => {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data } = await supabase
    .from("promotions")
    .select("id, name, description, code, discount_type, value, min_subtotal, ends_at, applies_online")
    .eq("is_active", true)
    .or(`starts_at.is.null,starts_at.lte.${now}`)
    .or(`ends_at.is.null,ends_at.gt.${now}`)
    .order("created_at", { ascending: false });
  return data ?? [];
});

export const getRewardsCatalog = cache(async (): Promise<(Reward & { product_name: string | null })[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("rewards")
    .select("*, products(name)")
    .eq("is_active", true)
    .eq("is_redeemable", true)
    .order("points_cost");
  const now = Date.now();
  return (data ?? [])
    .filter((r) => !r.expires_at || new Date(r.expires_at).getTime() > now)
    .map((r) => ({ ...r, value: Number(r.value), product_name: (r.products as { name: string } | null)?.name ?? null })) as (Reward & {
    product_name: string | null;
  })[];
});
