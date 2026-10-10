"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { adminClient, bool, notAdmin, text } from "@/lib/admin";
import { ok, toFailure, type ActionResult } from "@/lib/errors";
import { slugify } from "@/lib/utils";

export type FormState = { error?: string; saved?: boolean };

const productSchema = z.object({
  name: z.string().min(1, "Name is required.").max(100),
  slug: z.string().regex(/^[a-z0-9-]+$/, "Slug can only use a–z, 0–9 and dashes.").max(60),
  category_id: z.uuid("Pick a category."),
  description: z.string().max(500),
  price: z.number().min(0, "Price can't be negative.").max(100000),
  image_url: z.string().url().nullable(),
  pos_icon_url: z.string().url().nullable().optional(),
  is_available: z.boolean(),
  is_featured: z.boolean(),
  is_addon: z.boolean(),
  points_eligible: z.boolean(),
  sort_order: z.number().int().min(0).max(9999),
});

function revalidateMenu() {
  revalidatePath("/admin/menu");
  revalidatePath("/menu", "layout");
  revalidatePath("/");
  revalidatePath("/pos");
}

export async function saveProduct(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await adminClient();
  if (!ctx) return { error: notAdmin.error };
  const id = text(form, "id");
  const name = text(form, "name");
  const parsed = productSchema.safeParse({
    name,
    slug: text(form, "slug") || slugify(name),
    category_id: text(form, "category_id"),
    description: text(form, "description"),
    price: Number(text(form, "price")),
    image_url: text(form, "image_url") || null,
    // Only sent when the icon was changed in the form
    pos_icon_url: form.has("pos_icon_url") ? text(form, "pos_icon_url") || null : undefined,
    is_available: bool(form, "is_available"),
    is_featured: bool(form, "is_featured"),
    is_addon: bool(form, "is_addon"),
    points_eligible: bool(form, "points_eligible"),
    sort_order: Number(text(form, "sort_order") || 0),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const addonIds = form.getAll("addons").map(String).filter((x) => z.uuid().safeParse(x).success);

  const { supabase } = ctx;
  let productId = id;
  if (id) {
    const { error } = await supabase.from("products").update(parsed.data).eq("id", id);
    if (error) return { error: toFailure(error).error };
  } else {
    const { data, error } = await supabase.from("products").insert(parsed.data).select("id").single();
    if (error) return { error: toFailure(error).error };
    productId = data.id;
  }
  // Replace the allowed add-ons
  const { error: delErr } = await supabase.from("product_addons").delete().eq("product_id", productId);
  if (delErr) return { error: toFailure(delErr).error };
  const links = addonIds.filter((a) => a !== productId).map((a) => ({ product_id: productId, addon_product_id: a }));
  if (links.length) {
    const { error } = await supabase.from("product_addons").insert(links);
    if (error) return { error: toFailure(error).error };
  }
  // Servings stock goes through the audited function
  const track = bool(form, "track_stock");
  const qty = Math.max(0, Math.floor(Number(text(form, "stock_quantity") || 0)));
  const { data: cur } = await supabase.from("products").select("track_stock, stock_quantity").eq("id", productId).single();
  if (cur && (cur.track_stock !== track || cur.stock_quantity !== qty)) {
    const { error: stockErr } = await supabase.rpc("set_product_stock", { p_product_id: productId, p_track: track, p_quantity: qty });
    if (stockErr) return { error: toFailure(stockErr).error };
  }
  // Price changes affect margins: record a cost snapshot
  await supabase.rpc("admin_snapshot_costs");
  revalidateMenu();
  if (!id) redirect(`/admin/menu/${productId}?created=1`);
  return { saved: true };
}

export async function setProductFlag(id: string, flag: "is_available" | "is_archived" | "is_featured", value: boolean): Promise<ActionResult> {
  const ctx = await adminClient();
  if (!ctx) return notAdmin;
  const { error } = await ctx.supabase.from("products").update({ [flag]: value }).eq("id", id);
  if (error) return toFailure(error);
  revalidateMenu();
  return ok(undefined);
}

const categorySchema = z.object({
  name: z.string().min(1, "Name is required.").max(80),
  slug: z.string().regex(/^[a-z0-9-]+$/).max(60),
  description: z.string().max(300),
  sort_order: z.number().int().min(0).max(999),
  is_active: z.boolean(),
  is_addon_category: z.boolean(),
});

export async function saveCategory(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await adminClient();
  if (!ctx) return { error: notAdmin.error };
  const id = text(form, "id");
  const name = text(form, "name");
  const parsed = categorySchema.safeParse({
    name,
    slug: text(form, "slug") || slugify(name),
    description: text(form, "description"),
    sort_order: Number(text(form, "sort_order") || 0),
    is_active: bool(form, "is_active"),
    is_addon_category: bool(form, "is_addon_category"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const q = id ? ctx.supabase.from("categories").update(parsed.data).eq("id", id) : ctx.supabase.from("categories").insert(parsed.data);
  const { error } = await q;
  if (error) return { error: toFailure(error).error };
  revalidatePath("/admin/menu/categories");
  revalidateMenu();
  return { saved: true };
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  const ctx = await adminClient();
  if (!ctx) return notAdmin;
  const { count } = await ctx.supabase.from("products").select("id", { count: "exact", head: true }).eq("category_id", id);
  if (count) return { ok: false, error: "Move or archive this category's products first, or just hide the category." };
  const { error } = await ctx.supabase.from("categories").delete().eq("id", id);
  if (error) return toFailure(error);
  revalidatePath("/admin/menu/categories");
  return ok(undefined);
}
