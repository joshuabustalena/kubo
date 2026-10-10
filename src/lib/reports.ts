import "server-only";
import { createClient } from "@/lib/supabase/server";

export type Summary = {
  orders: number;
  gross_sales: number;
  discounts: number;
  refunds: number;
  net_sales: number;
  packaging_fees: number;
  average_order_value: number;
  dine_in_orders: number;
  takeout_orders: number;
  dine_in_sales: number;
  takeout_sales: number;
  online_orders: number;
  pos_orders: number;
  cash_received: number;
  digital_received: number;
  payments_by_method: { method: string; code: string; is_cash: boolean; amount: number; count: number }[];
  cogs: number;
  gross_profit: number;
  gross_margin: number;
  expenses: number;
  labor_cost: number;
  expenses_by_category: Record<string, number>;
  net_operating_profit: number;
  voids_count: number;
  voids_amount: number;
  cancelled_orders: number;
  open_orders: number;
};

const n = (v: unknown) => Number(v ?? 0);

export async function getSummary(from: string, to: string): Promise<Summary> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_summary", { p_from: from, p_to: to });
  if (error) throw new Error(error.message);
  const out: Record<string, unknown> = { ...data };
  for (const [k, v] of Object.entries(data)) if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v)) out[k] = Number(v);
  out.payments_by_method = (data.payments_by_method ?? []).map((p: Record<string, unknown>) => ({ ...p, amount: n(p.amount), count: n(p.count) }));
  out.expenses_by_category = Object.fromEntries(Object.entries(data.expenses_by_category ?? {}).map(([k, v]) => [k, n(v)]));
  return out as Summary;
}

export type DailyRow = { day: string; orders: number; gross_sales: number; discounts: number; refunds: number; net_sales: number; cogs: number; gross_profit: number };
export type ProductRow = { product_id: string | null; product_name: string; category_name: string; quantity: number; revenue: number; cost: number; gross_profit: number; margin: number };

export async function getDailySales(from: string, to: string): Promise<DailyRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_daily_sales", { p_from: from, p_to: to });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    day: String(r.day),
    orders: n(r.orders),
    gross_sales: n(r.gross_sales),
    discounts: n(r.discounts),
    refunds: n(r.refunds),
    net_sales: n(r.net_sales),
    cogs: n(r.cogs),
    gross_profit: n(r.gross_profit),
  }));
}

export async function getProductSales(from: string, to: string): Promise<ProductRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_product_sales", { p_from: from, p_to: to });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    product_id: r.product_id as string | null,
    product_name: String(r.product_name),
    category_name: String(r.category_name),
    quantity: n(r.quantity),
    revenue: n(r.revenue),
    cost: n(r.cost),
    gross_profit: n(r.gross_profit),
    margin: n(r.margin),
  }));
}

export const EXPENSE_LABEL: Record<string, string> = {
  labor: "Labor",
  rent: "Rent",
  utilities: "Utilities",
  supplies: "Supplies",
  maintenance: "Maintenance",
  marketing: "Marketing",
  transport: "Transport",
  other: "Other",
};

/** Money paid for stock: purchases received between the two Manila dates. */
export async function getStockPurchases(from: string, to: string): Promise<number> {
  const supabase = await createClient();
  const start = new Date(`${from}T00:00:00+08:00`).toISOString();
  const end = new Date(new Date(`${to}T00:00:00+08:00`).getTime() + 86400000).toISOString();
  const { data } = await supabase.from("purchase_orders").select("total_cost").eq("status", "received").gte("received_at", start).lt("received_at", end);
  return (data ?? []).reduce((s, p) => s + Number(p.total_cost), 0);
}
