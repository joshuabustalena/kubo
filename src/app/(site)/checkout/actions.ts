"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { ok, toFailure, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

const item = z.object({
  product_id: z.uuid(),
  quantity: z.number().int().min(1).max(20),
  addons: z.array(z.uuid()).max(10).default([]),
  notes: z.string().max(200).default(""),
});

const input = z.object({
  items: z.array(item).min(1).max(30),
  service_type: z.enum(["dine_in", "takeout"]),
  payment_method: z.string().min(1).max(30),
  promo_code: z.string().max(20).optional().default(""),
  redemption_code: z.string().max(20).optional().default(""),
});

export type Quote = {
  subtotal: number;
  packaging_fee: number;
  discount_total: number;
  total: number;
  discount_reason: string;
  points: number;
  tokens: number;
  lines: { product_id: string; name: string; unit_price: number; quantity: number; line_total: number; is_addon: boolean; points: number }[];
};

export async function quoteCart(raw: z.input<typeof input>): Promise<ActionResult<Quote>> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Your tray has an invalid item. Please refresh the page." };
  if (!(await getCurrentUser())) return { ok: false, error: "Please log in to continue." };
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("quote_order", {
    p_channel: "online",
    p_items: v.items,
    p_service_type: v.service_type,
    p_payment_method: v.payment_method,
    p_promo_code: v.promo_code,
    p_redemption_code: v.redemption_code,
  });
  if (error) return toFailure(error);
  if (!data.ok) return { ok: false, error: data.error };
  return ok({
    ...data,
    subtotal: Number(data.subtotal),
    packaging_fee: Number(data.packaging_fee),
    discount_total: Number(data.discount_total),
    total: Number(data.total),
  } as Quote);
}

const placeInput = input.extend({
  payment_reference: z.string().max(60).optional().default(""),
  notes: z.string().max(500).optional().default(""),
  idempotency_key: z.uuid(),
});

export async function placeOrder(raw: z.input<typeof placeInput>): Promise<ActionResult<{ order_id: string; order_number: string }>> {
  const parsed = placeInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Please check your order details." };
  if (!(await getCurrentUser())) return { ok: false, error: "Please log in to place your order." };
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("place_online_order", {
    p_items: v.items,
    p_service_type: v.service_type,
    p_payment_method: v.payment_method,
    p_payment_reference: v.payment_reference,
    p_notes: v.notes,
    p_promo_code: v.promo_code,
    p_redemption_code: v.redemption_code,
    p_idempotency_key: v.idempotency_key,
  });
  if (error) return toFailure(error);
  revalidatePath("/account/orders");
  return ok({ order_id: data.order_id as string, order_number: data.order_number as string });
}

export async function cancelMyOrder(orderId: string, reason: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(orderId).success) return { ok: false, error: "Order not found." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_my_order", { p_order_id: orderId, p_reason: reason.slice(0, 200) });
  if (error) return toFailure(error);
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/account/orders");
  return ok(undefined);
}
