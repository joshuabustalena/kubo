"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminClient, bool, notAdmin, text } from "@/lib/admin";
import { ok, toFailure, type ActionResult } from "@/lib/errors";

export type FormState = { error?: string; saved?: boolean };

const settingsSchema = z.object({
  store_name: z.string().trim().min(1).max(80),
  tagline: z.string().max(160),
  about: z.string().max(3000),
  address: z.string().max(200),
  phone: z.string().max(40),
  email: z.union([z.literal(""), z.email("Invalid store email.")]),
  facebook_url: z.union([z.literal(""), z.url("Facebook link must be a full URL.")]),
  map_url: z.union([z.literal(""), z.url("Map link must be a full URL.")]),
  opening_hours: z.array(z.object({ days: z.string().trim().min(1).max(40), hours: z.string().trim().min(1).max(60) })).max(10),
  online_ordering_enabled: z.boolean(),
  takeout_packaging_fee: z.number().min(0).max(1000),
  inventory_deduct_stage: z.enum(["preparing", "completed"]),
  restock_on_cancel: z.boolean(),
  block_orders_on_low_stock: z.boolean(),
  max_staff_discount_percent: z.number().min(0).max(100),
});

export async function saveSettings(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await adminClient();
  if (!ctx) return { error: notAdmin.error };
  const days = form.getAll("hours_days").map(String);
  const hours = form.getAll("hours_hours").map(String);
  const parsed = settingsSchema.safeParse({
    store_name: text(form, "store_name"),
    tagline: text(form, "tagline"),
    about: text(form, "about"),
    address: text(form, "address"),
    phone: text(form, "phone"),
    email: text(form, "email"),
    facebook_url: text(form, "facebook_url"),
    map_url: text(form, "map_url"),
    opening_hours: days.map((d, i) => ({ days: d, hours: hours[i] ?? "" })).filter((h) => h.days.trim() || h.hours.trim()),
    online_ordering_enabled: bool(form, "online_ordering_enabled"),
    takeout_packaging_fee: Number(text(form, "takeout_packaging_fee") || 0),
    inventory_deduct_stage: text(form, "inventory_deduct_stage"),
    restock_on_cancel: bool(form, "restock_on_cancel"),
    block_orders_on_low_stock: bool(form, "block_orders_on_low_stock"),
    max_staff_discount_percent: Number(text(form, "max_staff_discount_percent") || 0),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { error } = await ctx.supabase.from("store_settings").update(parsed.data).eq("id", true);
  if (error) return { error: toFailure(error).error };
  revalidatePath("/", "layout");
  return { saved: true };
}

const methodSchema = z.object({
  code: z.string().regex(/^[a-z0-9_]{2,20}$/, "Code: lowercase letters, numbers, underscores."),
  name: z.string().trim().min(1).max(40),
  instructions: z.string().max(400),
  is_active: z.boolean(),
  allow_online: z.boolean(),
  allow_pos: z.boolean(),
  is_cash: z.boolean(),
  requires_reference: z.boolean(),
  sort_order: z.number().int().min(0).max(99),
});

export async function savePaymentMethod(raw: z.input<typeof methodSchema>, isNew: boolean): Promise<ActionResult> {
  const ctx = await adminClient();
  if (!ctx) return notAdmin;
  const parsed = methodSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { error } = isNew
    ? await ctx.supabase.from("payment_methods").insert(parsed.data)
    : await ctx.supabase.from("payment_methods").update(parsed.data).eq("code", parsed.data.code);
  if (error) return toFailure(error);
  revalidatePath("/admin/settings");
  revalidatePath("/checkout");
  return ok(undefined);
}
