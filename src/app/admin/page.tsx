import { AlertTriangle, ArrowRight, Wallet } from "lucide-react";
import Link from "next/link";
import { DateRangeFilter } from "@/components/admin/date-range";
import { PageHeader } from "@/components/admin/page-header";
import { RankedBars, SalesTrendChart } from "@/components/admin/charts";
import { Ledger, Stat } from "@/components/admin/stat";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { dateRange } from "@/lib/admin";
import { dateOnly, manilaToday, num, peso, percent, UNIT_LABEL } from "@/lib/format";
import { EXPENSE_LABEL, getDailySales, getProductSales, getStockPurchases, getSummary, type Summary } from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";

export default async function AdminDashboard(props: PageProps<"/admin">) {
  const sp = await props.searchParams;
  const { from, to } = dateRange(sp, 30);
  const today = manilaToday();
  const supabase = await createClient();
  const [todaySum, sum, daily, products, inv, pendingPay, demo, todayStock, rangeStock] = await Promise.all([
    getSummary(today, today),
    getSummary(from, to),
    getDailySales(from, to),
    getProductSales(from, to),
    supabase.rpc("inventory_overview"),
    supabase.from("payments").select("id, amount, reference_no, order_id, orders(order_number)").eq("status", "pending").order("created_at"),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("is_demo", true),
    getStockPurchases(today, today),
    getStockPurchases(from, to),
  ]);
  // Money that went out = stock bought + recorded expenses
  const todaySpent = todayStock + todaySum.expenses;
  const todayIn = todaySum.cash_received + todaySum.digital_received;
  const rangeSpent = rangeStock + sum.expenses;
  const overview = inv.data as { stock_value: number; low_stock: { id: string; name: string; unit: string; current_stock: number; min_stock: number }[]; expiring: { id: string; name: string; expiration_date: string }[] } | null;
  const top = products.slice(0, 8);

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="All amounts in pesos, dated by completion time (Asia/Manila)." actions={<DateRangeFilter from={from} to={to} />} />

      {demo.count ? (
        <Alert tone="info" title={`Includes ${demo.count} demo orders`}>Demo transactions were generated for development. Use a separate Supabase project for real sales.</Alert>
      ) : null}

      {(pendingPay.data ?? []).length > 0 ? (
        <Alert tone="warning" title={`${pendingPay.data!.length} GCash payment(s) waiting for verification`}>
          {(pendingPay.data ?? []).slice(0, 5).map((p) => (
            <Link key={p.id} href={`/admin/orders/${p.order_id}`} className="mr-3 inline-flex items-center gap-1 font-semibold underline">
              <Wallet className="size-3.5" /> {(p.orders as unknown as { order_number: string } | null)?.order_number} · {peso(p.amount)}
            </Link>
          ))}
        </Alert>
      ) : null}

      <section aria-labelledby="today">
        <h2 id="today" className="mb-2 font-display text-xl font-bold text-wood-800">Today</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Sales today" value={peso(todaySum.net_sales)} hint={`${todaySum.orders} completed orders`} />
          <Stat
            label="Money spent today"
            value={peso(todaySpent)}
            hint={<>Stock bought {peso(todayStock)} · Expenses {peso(todaySum.expenses)}<br /><Link href="/admin/expenses" className="underline">Add expense</Link> · <Link href="/admin/purchases/new" className="underline">Record stock</Link></>}
          />
          <Stat label="Est. profit today" value={peso(todaySum.net_operating_profit)} tone={todaySum.net_operating_profit < 0 ? "bad" : undefined} hint="Sales − food cost of what was sold − expenses" />
          <Stat label="Money in − money out" value={peso(todayIn - todaySpent)} tone={todayIn - todaySpent < 0 ? "bad" : undefined} hint={`In ${peso(todayIn)} (cash ${peso(todaySum.cash_received)}, digital ${peso(todaySum.digital_received)})`} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Avg. order" value={peso(todaySum.average_order_value)} />
          <Stat label="Est. gross profit" value={peso(todaySum.gross_profit)} hint={`${percent(todaySum.gross_margin)} margin`} />
          <Stat label="Discounts & refunds" value={peso(todaySum.discounts + todaySum.refunds)} />
          <Stat label="Open orders" value={todaySum.open_orders} hint={<Link href="/pos/orders" className="underline">Order queue</Link>} />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Selected range">
        <Stat label="Orders" value={num(sum.orders, 0)} hint={`${sum.online_orders} online · ${sum.pos_orders} walk-in`} />
        <Stat label="Net sales" value={peso(sum.net_sales)} hint={`Gross ${peso(sum.gross_sales)}`} />
        <Stat label="Average order value" value={peso(sum.average_order_value)} />
        <Stat label="Money spent" value={peso(rangeSpent)} hint={`Stock ${peso(rangeStock)} · Expenses ${peso(sum.expenses)}`} />
        <Stat label="Est. net operating profit" value={peso(sum.net_operating_profit)} tone={sum.net_operating_profit < 0 ? "bad" : undefined} hint="After recorded expenses" />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader title="Daily net sales and estimated gross profit" description={`${dateOnly(from)} – ${dateOnly(to)}`} />
          <CardBody>
            {sum.orders === 0 ? <EmptyState title="No completed orders in this range" /> : <SalesTrendChart data={daily} />}
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer font-semibold text-forest-700">Show as table</summary>
              <div className="mt-2 max-h-64 overflow-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs uppercase text-ink-muted"><th className="py-1">Day</th><th>Orders</th><th className="text-right">Net sales</th><th className="text-right">Gross profit</th></tr></thead>
                  <tbody>{daily.map((d) => <tr key={d.day} className="border-t border-bamboo-300/30"><td className="py-1">{dateOnly(d.day)}</td><td>{d.orders}</td><td className="text-right">{peso(d.net_sales)}</td><td className="text-right">{peso(d.gross_profit)}</td></tr>)}</tbody>
                </table>
              </div>
            </details>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Business performance" description="Estimated — based on recipe cost snapshots" />
          <CardBody>
            <Ledger
              rows={[
                { label: "Gross sales", value: peso(sum.gross_sales), hint: `incl. ${peso(sum.packaging_fees)} packaging fees` },
                { label: "Discounts", value: `−${peso(sum.discounts)}`, negative: true },
                { label: "Refunds", value: `−${peso(sum.refunds)}`, negative: true },
                { label: "Net sales", value: peso(sum.net_sales), strong: true },
                { label: "Est. cost of goods sold", value: `−${peso(sum.cogs)}`, negative: true },
                { label: "Est. gross profit", value: `${peso(sum.gross_profit)} (${percent(sum.gross_margin)})`, strong: true },
                { label: "Labor", value: `−${peso(sum.labor_cost)}`, negative: true },
                { label: "Other operating expenses", value: `−${peso(sum.expenses - sum.labor_cost)}`, negative: true },
                { label: "Est. net operating profit", value: peso(sum.net_operating_profit), strong: true, negative: sum.net_operating_profit < 0 },
              ]}
            />
            <p className="mt-2 text-xs text-ink-muted">Gross profit is food-level (selling price − ingredient, drink & packaging cost). Net operating profit also subtracts the expenses you record; it is not a tax or accounting figure.</p>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Best sellers" description="Quantity sold (net of refunds)" action={<ButtonLink href={`/admin/reports?from=${from}&to=${to}`} variant="ghost" size="sm">Full report <ArrowRight /></ButtonLink>} />
          <CardBody>
            {top.length === 0 ? <EmptyState title="No sales yet" /> : (
              <RankedBars format="number" valueLabel="Sold" data={top.map((p) => ({ label: p.product_name, value: p.quantity, note: `${peso(p.revenue)} revenue · ${percent(p.margin)} margin` }))} />
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Sales mix" />
          <CardBody className="space-y-5">
            <div>
              <p className="mb-1 text-sm font-bold text-wood-700">By payment method</p>
              {sum.payments_by_method.length === 0 ? <p className="text-sm text-ink-muted">No payments.</p> : (
                <RankedBars valueLabel="Collected" data={sum.payments_by_method.map((p: Summary["payments_by_method"][number]) => ({ label: p.method, value: p.amount, note: `${p.count} payments` }))} />
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Dine-in" value={peso(sum.dine_in_sales)} hint={`${sum.dine_in_orders} orders`} />
              <Stat label="Takeout" value={peso(sum.takeout_sales)} hint={`${sum.takeout_orders} orders`} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Voids" value={peso(sum.voids_amount)} hint={`${sum.voids_count} voided · ${sum.cancelled_orders} cancelled`} />
              <Stat label="Expenses" value={peso(sum.expenses)} hint={Object.entries(sum.expenses_by_category).map(([k, v]) => `${EXPENSE_LABEL[k]} ${peso(v)}`).join(" · ") || "None recorded"} />
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Inventory alerts"
          description={overview ? `Stock value at average cost: ${peso(overview.stock_value)}` : undefined}
          action={<ButtonLink href="/admin/inventory" variant="ghost" size="sm">Inventory <ArrowRight /></ButtonLink>}
        />
        <CardBody className="grid gap-6 md:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-bold text-wood-700">Low stock ({overview?.low_stock.length ?? 0})</p>
            {(overview?.low_stock ?? []).length === 0 ? <p className="text-sm text-ink-muted">Everything is above its minimum level.</p> : (
              <ul className="space-y-1 text-sm">
                {overview!.low_stock.slice(0, 10).map((i) => (
                  <li key={i.id} className="flex justify-between gap-2">
                    <Link href={`/admin/inventory/${i.id}`} className="flex items-center gap-1.5 font-semibold hover:underline"><AlertTriangle className="size-3.5 text-terracotta-600" />{i.name}</Link>
                    <span className="tabular-nums">{num(i.current_stock, 2)} / min {num(i.min_stock, 2)} {UNIT_LABEL[i.unit]}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="mb-2 text-sm font-bold text-wood-700">Expiring within 7 days ({overview?.expiring.length ?? 0})</p>
            {(overview?.expiring ?? []).length === 0 ? <p className="text-sm text-ink-muted">Nothing expiring soon.</p> : (
              <ul className="space-y-1 text-sm">
                {overview!.expiring.map((i) => (
                  <li key={i.id} className="flex justify-between gap-2"><Link href={`/admin/inventory/${i.id}`} className="font-semibold hover:underline">{i.name}</Link><span>{dateOnly(i.expiration_date)}</span></li>
                ))}
              </ul>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
