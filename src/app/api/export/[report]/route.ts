import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { createClient } from "@/lib/supabase/server";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const startOf = (d: string) => new Date(`${d}T00:00:00+08:00`).toISOString();
const endOf = (d: string) => new Date(new Date(`${d}T00:00:00+08:00`).getTime() + 86400000).toISOString();

/** Admin-only CSV exports. Every query runs as the signed-in admin (RLS applies). */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/export/[report]">) {
  const { report } = await ctx.params;
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  const sp = request.nextUrl.searchParams;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  const from = ISO.test(sp.get("from") ?? "") ? sp.get("from")! : today;
  const to = ISO.test(sp.get("to") ?? "") ? sp.get("to")! : today;
  const supabase = await createClient();

  let rows: Record<string, unknown>[] = [];
  let columns: { key: string; label: string }[] | undefined;
  let error: { message: string } | null = null;

  switch (report) {
    case "daily": {
      const r = await supabase.rpc("report_daily_sales", { p_from: from, p_to: to });
      rows = r.data ?? []; error = r.error;
      columns = [
        { key: "day", label: "Date" }, { key: "orders", label: "Orders" }, { key: "gross_sales", label: "Gross sales" },
        { key: "discounts", label: "Discounts" }, { key: "refunds", label: "Refunds" }, { key: "net_sales", label: "Net sales" },
        { key: "cogs", label: "Est. COGS" }, { key: "gross_profit", label: "Est. gross profit" },
      ];
      break;
    }
    case "products": {
      const r = await supabase.rpc("report_product_sales", { p_from: from, p_to: to });
      rows = r.data ?? []; error = r.error;
      columns = [
        { key: "product_name", label: "Product" }, { key: "category_name", label: "Category" }, { key: "quantity", label: "Qty sold" },
        { key: "revenue", label: "Revenue" }, { key: "cost", label: "Est. cost" }, { key: "gross_profit", label: "Est. gross profit" }, { key: "margin", label: "Margin %" },
      ];
      break;
    }
    case "ingredients": {
      const r = await supabase.rpc("report_ingredient_usage", { p_from: from, p_to: to });
      rows = r.data ?? []; error = r.error;
      columns = [
        { key: "item_name", label: "Ingredient" }, { key: "unit", label: "Unit" }, { key: "used", label: "Used" }, { key: "used_cost", label: "Used cost" },
        { key: "purchased", label: "Purchased" }, { key: "purchased_cost", label: "Purchase cost" }, { key: "wasted", label: "Spoiled" },
        { key: "wasted_cost", label: "Spoilage cost" }, { key: "adjusted", label: "Adjustments" },
      ];
      break;
    }
    case "staff": {
      const r = await supabase.rpc("report_staff_summary", { p_from: from, p_to: to });
      rows = r.data ?? []; error = r.error;
      columns = [
        { key: "staff_name", label: "Staff" }, { key: "role", label: "Role" }, { key: "orders", label: "POS orders" }, { key: "sales", label: "Sales" },
        { key: "discounts", label: "Discounts" }, { key: "voids", label: "Voids" }, { key: "void_amount", label: "Void amount" },
        { key: "refunds", label: "Refunds" }, { key: "refund_amount", label: "Refund amount" },
      ];
      break;
    }
    case "orders": {
      const r = await supabase
        .from("orders")
        .select("order_number, created_at, completed_at, channel, service_type, status, payment_status, payment_method_code, customer_name, subtotal, packaging_fee, discount_total, total, refunded_total, discount_reason, is_demo")
        .gte("created_at", startOf(from)).lt("created_at", endOf(to)).order("created_at").limit(20000);
      rows = r.data ?? []; error = r.error;
      break;
    }
    case "expenses": {
      const r = await supabase.from("operating_expenses").select("expense_date, category, description, amount").gte("expense_date", from).lte("expense_date", to).order("expense_date");
      rows = r.data ?? []; error = r.error;
      break;
    }
    case "customers": {
      const r = await supabase.from("profiles").select("full_name, email, phone, points_balance, created_at, is_active").eq("role", "customer").order("created_at").limit(20000);
      rows = r.data ?? []; error = r.error;
      break;
    }
    case "audit": {
      const r = await supabase.from("audit_logs").select("created_at, actor_id, action, entity_type, entity_id, details").gte("created_at", startOf(from)).lt("created_at", endOf(to)).order("created_at").limit(20000);
      rows = r.data ?? []; error = r.error;
      break;
    }
    default:
      return NextResponse.json({ error: "Unknown report." }, { status: 404 });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return new NextResponse(toCsv(rows, columns), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="kainan-sa-kubo-${report}-${from}_to_${to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
