"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminClient, bool, notAdmin, text } from "@/lib/admin";
import { ok, toFailure, type ActionResult } from "@/lib/errors";

export type FormState = { error?: string; saved?: boolean };

export async function adjustPoints(customerId: string, points: number, reason: string): Promise<ActionResult> {
  const ctx = await adminClient();
  if (!ctx) return notAdmin;
  if (!Number.isInteger(points) || points === 0 || Math.abs(points) > 10000) return { ok: false, error: "Enter a whole number of points." };
  const { error } = await ctx.supabase.rpc("admin_adjust_points", { p_customer_id: customerId, p_points: points, p_reason: reason.slice(0, 200) });
  if (error) return toFailure(error);
  revalidatePath(`/admin/customers/${customerId}`);
  return ok(undefined);
}

export async function cancelRedemption(id: string, reason: string): Promise<ActionResult> {
  const ctx = await adminClient();
  if (!ctx) return notAdmin;
  const { error } = await ctx.supabase.rpc("cancel_redemption", { p_redemption_id: id, p_reason: reason.slice(0, 200) });
  if (error) return toFailure(error);
  revalidatePath("/admin/customers", "layout");
  revalidatePath("/admin/rewards");
  return ok(undefined);
}

const rulesSchema = z.object({
  points_enabled: z.boolean(),
  points_price_threshold: z.number().min(0).max(100000),
  points_at_or_below: z.number().int().min(0).max(100),
  points_above: z.number().int().min(0).max(100),
  points_on_addons: z.boolean(),
});

export async function saveLoyaltyRules(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await adminClient();
  if (!ctx) return { error: notAdmin.error };
  const parsed = rulesSchema.safeParse({
    points_enabled: bool(form, "points_enabled"),
    points_price_threshold: Number(text(form, "points_price_threshold")),
    points_at_or_below: Number(text(form, "points_at_or_below")),
    points_above: Number(text(form, "points_above")),
    points_on_addons: bool(form, "points_on_addons"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { error } = await ctx.supabase.from("store_settings").update(parsed.data).eq("id", true);
  if (error) return { error: toFailure(error).error };
  revalidatePath("/", "layout");
  return { saved: true };
}

const rewardSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(100),
  description: z.string().max(300),
  reward_type: z.enum(["free_product", "fixed_discount", "percent_discount"]),
  value: z.number().min(0).max(100000),
  product_id: z.uuid().nullable(),
  points_cost: z.number().int().min(0).max(100000),
  is_redeemable: z.boolean(),
  per_customer_limit: z.number().int().positive().nullable(),
  total_limit: z.number().int().positive().nullable(),
  valid_days: z.number().int().min(1).max(365),
  expires_at: z.string().nullable(),
  is_active: z.boolean(),
}).refine((r) => r.reward_type !== "free_product" || r.product_id, { message: "Pick the free item." })
  .refine((r) => r.reward_type !== "percent_discount" || r.value <= 100, { message: "Percent can't exceed 100." })
  .refine((r) => r.reward_type === "free_product" || r.value > 0, { message: "Enter the discount value." })
  .refine((r) => !r.is_redeemable || r.points_cost > 0, { message: "Rewards redeemable with points need a points cost." });

export async function saveReward(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await adminClient();
  if (!ctx) return { error: notAdmin.error };
  const id = text(form, "id");
  const optInt = (k: string) => (text(form, k) ? Number(text(form, k)) : null);
  const parsed = rewardSchema.safeParse({
    name: text(form, "name"),
    description: text(form, "description"),
    reward_type: text(form, "reward_type"),
    value: Number(text(form, "value") || 0),
    product_id: text(form, "product_id") || null,
    points_cost: Number(text(form, "points_cost") || 0),
    is_redeemable: bool(form, "is_redeemable"),
    per_customer_limit: optInt("per_customer_limit"),
    total_limit: optInt("total_limit"),
    valid_days: Number(text(form, "valid_days") || 30),
    expires_at: text(form, "expires_at") ? new Date(`${text(form, "expires_at")}T23:59:59+08:00`).toISOString() : null,
    is_active: bool(form, "is_active"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const data = { ...parsed.data, product_id: parsed.data.reward_type === "free_product" ? parsed.data.product_id : null };
  const q = id ? ctx.supabase.from("rewards").update(data).eq("id", id) : ctx.supabase.from("rewards").insert(data);
  const { error } = await q;
  if (error) return { error: toFailure(error).error };
  revalidatePath("/admin/rewards");
  revalidatePath("/account/rewards");
  return { saved: true };
}

const promoSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(100),
  description: z.string().max(300),
  code: z.string().regex(/^[A-Z0-9-]{3,20}$/, "Code: 3–20 letters, numbers or dashes.").nullable(),
  discount_type: z.enum(["percent", "fixed"]),
  value: z.number().positive("Enter the discount value."),
  min_subtotal: z.number().min(0),
  starts_at: z.string().nullable(),
  ends_at: z.string().nullable(),
  applies_online: z.boolean(),
  applies_pos: z.boolean(),
  is_active: z.boolean(),
}).refine((p) => p.discount_type !== "percent" || p.value <= 100, { message: "Percent can't exceed 100." });

export async function savePromotion(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await adminClient();
  if (!ctx) return { error: notAdmin.error };
  const id = text(form, "id");
  const day = (k: string, end: boolean) => (text(form, k) ? new Date(`${text(form, k)}T${end ? "23:59:59" : "00:00:00"}+08:00`).toISOString() : null);
  const parsed = promoSchema.safeParse({
    name: text(form, "name"),
    description: text(form, "description"),
    code: text(form, "code").toUpperCase() || null,
    discount_type: text(form, "discount_type"),
    value: Number(text(form, "value")),
    min_subtotal: Number(text(form, "min_subtotal") || 0),
    starts_at: day("starts_at", false),
    ends_at: day("ends_at", true),
    applies_online: bool(form, "applies_online"),
    applies_pos: bool(form, "applies_pos"),
    is_active: bool(form, "is_active"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const q = id ? ctx.supabase.from("promotions").update(parsed.data).eq("id", id) : ctx.supabase.from("promotions").insert(parsed.data);
  const { error } = await q;
  if (error) return { error: toFailure(error).error };
  revalidatePath("/admin/promotions");
  revalidatePath("/");
  return { saved: true };
}

/** Accounts have no email, so a forgotten password is reset here by an admin. */
export async function resetCustomerPassword(customerId: string, password: string): Promise<ActionResult> {
  const ctx = await adminClient();
  if (!ctx) return notAdmin;
  if (password.length < 8) return { ok: false, error: "Use at least 8 characters." };
  const { data: target } = await ctx.supabase.from("profiles").select("role").eq("id", customerId).maybeSingle();
  if (!target) return { ok: false, error: "Account not found." };
  if (target.role === "admin" && customerId !== ctx.user.id) return { ok: false, error: "Admins reset their own password from their account page." };
  try {
    const { createServiceClient } = await import("@/lib/supabase/admin");
    const { error } = await createServiceClient().auth.admin.updateUserById(customerId, { password });
    if (error) return { ok: false, error: error.message };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  await ctx.supabase.rpc("admin_log_password_reset", { p_user_id: customerId });
  return ok(undefined);
}

export async function adjustTokens(customerId: string, tokens: number, reason: string): Promise<ActionResult> {
  const ctx = await adminClient();
  if (!ctx) return notAdmin;
  if (!Number.isInteger(tokens) || tokens === 0 || Math.abs(tokens) > 1000) return { ok: false, error: "Enter a whole number of tokens." };
  const { error } = await ctx.supabase.rpc("admin_adjust_tokens", { p_customer_id: customerId, p_tokens: tokens, p_reason: reason.slice(0, 200) });
  if (error) return toFailure(error);
  revalidatePath(`/admin/customers/${customerId}`);
  return ok(undefined);
}

export async function saveTokenSettings(enabled: boolean, cost: number): Promise<ActionResult> {
  const ctx = await adminClient();
  if (!ctx) return notAdmin;
  if (!Number.isInteger(cost) || cost < 0 || cost > 10) return { ok: false, error: "Cost per round must be 0–10 tokens." };
  const { error } = await ctx.supabase.from("store_settings").update({ game_tokens_enabled: enabled, game_token_cost: cost }).eq("id", true);
  if (error) return toFailure(error);
  revalidatePath("/admin/games");
  revalidatePath("/play", "layout");
  return ok(undefined);
}
