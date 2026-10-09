import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Order, OrderItem, Payment } from "@/lib/types";

export type OrderDetail = Order & {
  items: OrderItem[];
  payments: Payment[];
  history: { id: number; from_status: string | null; to_status: string; note: string; created_at: string; changed_by: string | null }[];
  refunds: { id: string; kind: string; amount: number; reason: string; restocked: boolean; points_reversed: number; created_at: string }[];
  points_earned: number;
  tokens_earned: number;
  payment_method_name: string | null;
  staff_name: string | null;
};

const ITEM_COLUMNS =
  "id, order_id, parent_item_id, product_id, product_name, category_name, unit_price, quantity, line_total, points_eligible, points_per_unit, refunded_quantity, notes, created_at";

/** Loads an order the current user may see (RLS: own order, or staff). */
export async function getOrderDetail(id: string, opts: { withCosts?: boolean } = {}): Promise<OrderDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data: order } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();
  if (!order) return null;
  const [items, payments, history, refunds, method, staff, ledger, tokens] = await Promise.all([
    supabase.from("order_items").select(ITEM_COLUMNS).eq("order_id", id).order("created_at"),
    supabase.from("payments").select("*").eq("order_id", id).order("created_at"),
    supabase.from("order_status_history").select("*").eq("order_id", id).order("created_at"),
    supabase.from("refunds").select("*").eq("order_id", id).order("created_at"),
    order.payment_method_code ? supabase.from("payment_methods").select("name").eq("code", order.payment_method_code).maybeSingle() : Promise.resolve({ data: null }),
    order.staff_id ? supabase.from("profiles").select("full_name").eq("id", order.staff_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("loyalty_ledger").select("points").eq("order_id", id),
    supabase.from("game_token_ledger").select("tokens").eq("order_id", id),
  ]);
  const num = (v: unknown) => Number(v ?? 0);
  // Food cost snapshots are admin-only (column privileges + admin-checked function)
  const costs = new Map<string, number>();
  if (opts.withCosts) {
    const { data } = await supabase.rpc("admin_order_item_costs", { p_order_id: id });
    for (const c of (data ?? []) as { order_item_id: string; unit_cost: number }[]) costs.set(c.order_item_id, Number(c.unit_cost));
  }
  return {
    ...(order as Order),
    subtotal: num(order.subtotal),
    packaging_fee: num(order.packaging_fee),
    discount_total: num(order.discount_total),
    total: num(order.total),
    refunded_total: num(order.refunded_total),
    items: ((items.data ?? []) as Omit<OrderItem, "unit_cost">[]).map((i): OrderItem => ({ ...i, unit_price: num(i.unit_price), line_total: num(i.line_total), unit_cost: costs.get(i.id) ?? 0 })),
    payments: ((payments.data ?? []) as Payment[]).map((p) => ({ ...p, amount: num(p.amount), change_given: num(p.change_given), amount_tendered: p.amount_tendered == null ? null : num(p.amount_tendered) })),
    history: history.data ?? [],
    refunds: (refunds.data ?? []).map((r) => ({ ...r, amount: num(r.amount) })),
    points_earned: (ledger.data ?? []).reduce((s, r) => s + r.points, 0),
    tokens_earned: (tokens.data ?? []).reduce((s, r) => s + r.tokens, 0),
    payment_method_name: (method.data as { name: string } | null)?.name ?? null,
    staff_name: (staff.data as { full_name: string } | null)?.full_name ?? null,
  };
}

/** Groups add-on lines under their meal line. */
export function groupItems(items: OrderItem[]) {
  const parents = items.filter((i) => !i.parent_item_id);
  return parents.map((p) => ({ ...p, addons: items.filter((a) => a.parent_item_id === p.id) }));
}
