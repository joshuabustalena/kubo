"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { ok, toFailure, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

async function staffClient() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "staff" && user.role !== "admin")) return null;
  return createClient();
}
const denied = { ok: false as const, error: "Staff access required." };

const itemSchema = z.object({
  product_id: z.uuid(),
  quantity: z.number().int().min(1).max(20),
  addons: z.array(z.uuid()).max(10).default([]),
  notes: z.string().max(200).default(""),
});

const quoteSchema = z.object({
  items: z.array(itemSchema).min(1).max(30),
  service_type: z.enum(["dine_in", "takeout"]),
  payment_method: z.string().min(1).max(30),
  promo_code: z.string().max(20).default(""),
  redemption_code: z.string().max(20).default(""),
});

export type PosQuote = { subtotal: number; packaging_fee: number; discount_total: number; total: number; discount_reason: string; points: number };

export async function quotePos(raw: z.input<typeof quoteSchema>): Promise<ActionResult<PosQuote>> {
  const supabase = await staffClient();
  if (!supabase) return denied;
  const parsed = quoteSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid ticket." };
  const v = parsed.data;
  const { data, error } = await supabase.rpc("quote_order", {
    p_channel: "pos",
    p_items: v.items,
    p_service_type: v.service_type,
    p_payment_method: v.payment_method,
    p_promo_code: v.promo_code,
    p_redemption_code: v.redemption_code,
  });
  if (error) return toFailure(error);
  if (!data.ok) return { ok: false, error: data.error };
  return ok({
    subtotal: Number(data.subtotal),
    packaging_fee: Number(data.packaging_fee),
    discount_total: Number(data.discount_total),
    total: Number(data.total),
    discount_reason: data.discount_reason,
    points: data.points,
  });
}

const saleSchema = quoteSchema.extend({
  amount_tendered: z.number().min(0).max(1_000_000).nullable(),
  payment_reference: z.string().max(60).default(""),
  customer_id: z.uuid().nullable(),
  customer_name: z.string().max(120).default(""),
  discount_type: z.enum(["percent", "fixed"]).nullable(),
  discount_value: z.number().min(0).max(100_000).nullable(),
  discount_reason: z.string().max(200).default(""),
  override_grant: z.uuid().nullable(),
  complete_now: z.boolean(),
  notes: z.string().max(500).default(""),
  idempotency_key: z.uuid(),
});

export async function createPosSale(
  raw: z.input<typeof saleSchema>,
): Promise<ActionResult<{ order_id: string; order_number: string; total: number; change: number; replayed: boolean }>> {
  const supabase = await staffClient();
  if (!supabase) return denied;
  const parsed = saleSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid sale." };
  const v = parsed.data;
  const { data, error } = await supabase.rpc("pos_create_order", {
    p_items: v.items,
    p_service_type: v.service_type,
    p_payment_method: v.payment_method,
    p_amount_tendered: v.amount_tendered,
    p_payment_reference: v.payment_reference,
    p_customer_id: v.customer_id,
    p_customer_name: v.customer_name,
    p_promo_code: v.promo_code,
    p_redemption_code: v.redemption_code,
    p_discount_type: v.discount_value ? v.discount_type : null,
    p_discount_value: v.discount_value || null,
    p_discount_reason: v.discount_reason,
    p_override_grant: v.override_grant,
    p_complete_now: v.complete_now,
    p_notes: v.notes,
    p_idempotency_key: v.idempotency_key,
  });
  if (error) return toFailure(error);
  revalidatePath("/pos/orders");
  return ok({ order_id: data.order_id, order_number: data.order_number, total: Number(data.total), change: Number(data.change ?? 0), replayed: !!data.replayed });
}

export async function requestOverride(permission: string, pin: string): Promise<ActionResult<{ grant_id: string; granted_by_name: string }>> {
  const supabase = await staffClient();
  if (!supabase) return denied;
  if (!/^[0-9]{4,8}$/.test(pin)) return { ok: false, error: "Enter the 4–8 digit PIN." };
  const { data, error } = await supabase.rpc("request_override", { p_permission: permission, p_pin: pin });
  if (error) return toFailure(error);
  if (!data.ok) return { ok: false, error: data.error };
  return ok({ grant_id: data.grant_id, granted_by_name: data.granted_by_name });
}

export async function searchCustomers(q: string): Promise<ActionResult<{ id: string; full_name: string; username: string | null; phone: string; points_balance: number }[]>> {
  const supabase = await staffClient();
  if (!supabase) return denied;
  const term = q.trim().replace(/[%_,()*]/g, " ").slice(0, 60);
  if (term.length < 2) return ok([]);
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, username, phone, points_balance")
    .eq("role", "customer")
    .eq("is_active", true)
    .or(`full_name.ilike.%${term}%,username.ilike.%${term}%,phone.ilike.%${term}%`)
    .limit(8);
  if (error) return toFailure(error);
  return ok(data ?? []);
}

export type RedemptionLookup = {
  found: boolean;
  code?: string;
  status?: string;
  reward_name?: string;
  reward_type?: string;
  value?: number;
  product_name?: string | null;
  customer_id?: string;
  customer_name?: string;
  expires_at?: string;
  used_at?: string | null;
  order_number?: string | null;
};

export async function lookupRedemption(code: string): Promise<ActionResult<RedemptionLookup>> {
  const supabase = await staffClient();
  if (!supabase) return denied;
  const { data, error } = await supabase.rpc("lookup_redemption", { p_code: code.trim().slice(0, 20) });
  if (error) return toFailure(error);
  return ok(data as RedemptionLookup);
}

export async function redeemAtCounter(code: string, note: string): Promise<ActionResult> {
  const supabase = await staffClient();
  if (!supabase) return denied;
  const { error } = await supabase.rpc("use_redemption_at_counter", { p_code: code.trim().slice(0, 20), p_note: note.slice(0, 200) });
  if (error) return toFailure(error);
  return ok(undefined);
}

export async function setAvailability(productId: string, available: boolean): Promise<ActionResult> {
  const supabase = await staffClient();
  if (!supabase) return denied;
  const { error } = await supabase.rpc("set_product_availability", { p_product_id: productId, p_available: available });
  if (error) return toFailure(error);
  revalidatePath("/pos");
  revalidatePath("/menu");
  return ok(undefined);
}

export async function updateOrderStatus(orderId: string, status: string, note: string, grant: string | null): Promise<ActionResult> {
  const supabase = await staffClient();
  if (!supabase) return denied;
  const { error } = await supabase.rpc("update_order_status", { p_order_id: orderId, p_status: status, p_note: note.slice(0, 300), p_override_grant: grant });
  if (error) return toFailure(error);
  revalidatePath("/pos/orders");
  revalidatePath(`/pos/orders/${orderId}`);
  revalidatePath(`/admin/orders/${orderId}`);
  return ok(undefined);
}

export async function recordPayment(orderId: string, method: string, tendered: number | null, reference: string): Promise<ActionResult<{ change: number }>> {
  const supabase = await staffClient();
  if (!supabase) return denied;
  const { data, error } = await supabase.rpc("record_order_payment", { p_order_id: orderId, p_method: method, p_amount_tendered: tendered, p_reference: reference.slice(0, 60) });
  if (error) return toFailure(error);
  revalidatePath(`/pos/orders/${orderId}`);
  revalidatePath(`/admin/orders/${orderId}`);
  return ok({ change: Number(data.change ?? 0) });
}

export async function verifyPayment(paymentId: string, approve: boolean, note: string, orderId: string): Promise<ActionResult> {
  const supabase = await staffClient();
  if (!supabase) return denied;
  const { error } = await supabase.rpc("verify_payment", { p_payment_id: paymentId, p_approve: approve, p_note: note.slice(0, 200) });
  if (error) return toFailure(error);
  revalidatePath(`/pos/orders/${orderId}`);
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/pos/orders");
  return ok(undefined);
}

export async function refundOrder(
  orderId: string,
  items: { order_item_id: string; quantity: number }[] | null,
  reason: string,
  restock: boolean,
  grant: string | null,
): Promise<ActionResult<{ amount: number; points_reversed: number }>> {
  const supabase = await staffClient();
  if (!supabase) return denied;
  const { data, error } = await supabase.rpc("refund_order", {
    p_order_id: orderId,
    p_items: items,
    p_reason: reason.slice(0, 300),
    p_restock: restock,
    p_override_grant: grant,
  });
  if (error) return toFailure(error);
  revalidatePath(`/pos/orders/${orderId}`);
  revalidatePath(`/admin/orders/${orderId}`);
  return ok({ amount: Number(data.amount), points_reversed: data.points_reversed });
}

export async function setMyPin(pin: string): Promise<ActionResult> {
  const supabase = await staffClient();
  if (!supabase) return denied;
  const { error } = await supabase.rpc("set_my_pin", { p_pin: pin });
  if (error) return toFailure(error);
  revalidatePath("/pos/me");
  return ok(undefined);
}

export async function setStock(productId: string, track: boolean, quantity: number): Promise<ActionResult> {
  const supabase = await staffClient();
  if (!supabase) return denied;
  if (!Number.isInteger(quantity) || quantity < 0) return { ok: false, error: "Servings must be 0 or more." };
  const { error } = await supabase.rpc("set_product_stock", { p_product_id: productId, p_track: track, p_quantity: quantity });
  if (error) return toFailure(error);
  revalidatePath("/pos");
  revalidatePath("/menu", "layout");
  revalidatePath("/");
  return ok(undefined);
}
