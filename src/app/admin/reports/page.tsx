import { Download } from "lucide-react";
import type { Metadata } from "next";
import { RankedBars } from "@/components/admin/charts";
import { DateRangeFilter } from "@/components/admin/date-range";
import { PageHeader } from "@/components/admin/page-header";
import { Ledger, Stat } from "@/components/admin/stat";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { dateRange } from "@/lib/admin";
import { dateOnly, num, peso, percent, UNIT_LABEL } from "@/lib/format";
import { EXPENSE_LABEL, getDailySales, getProductSales, getSummary } from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reports" };

function Csv({ report, from, to }: { report: string; from: string; to: string }) {
  return <ButtonLink href={`/api/export/${report}?from=${from}&to=${to}`} variant="outline" size="sm"><Download /> CSV</ButtonLink>;
}

type Week = { label: string; orders: number; net: number; profit: number };

export default async function ReportsPage(props: PageProps<"/admin/reports">) {
  const sp = await props.searchParams;
  const { from, to } = dateRange(sp, 30);
  const supabase = await createClient();
  const [sum, daily, products, ingredients, staff, loyalty] = await Promise.all([
    getSummary(from, to),
    getDailySales(from, to),
    getProductSales(from, to),
    supabase.rpc("report_ingredient_usage", { p_from: from, p_to: to }),
    supabase.rpc("report_staff_summary", { p_from: from, p_to: to }),
    supabase.rpc("report_loyalty", { p_from: from, p_to: to }),
  ]);

  // Weekly (Mon–Sun) and monthly roll-ups from the daily series
  const weeks = new Map<string, Week>();
  const months = new Map<string, Week>();
  for (const d of daily) {
    const date = new Date(`${d.day}T12:00:00+08:00`);
    const monday = new Date(date);
    monday.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    const wk = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(monday);
    const mo = d.day.slice(0, 7);
    for (const [map, key, label] of [[weeks, wk, `Week of ${dateOnly(wk)}`], [months, mo, new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: "Asia/Manila" }).format(date)]] as const) {
      const cur = map.get(key) ?? { label, orders: 0, net: 0, profit: 0 };
      cur.orders += d.orders; cur.net += d.net_sales; cur.profit += d.gross_profit;
      map.set(key, cur);
    }
  }
  const ing = (ingredients.data ?? []) as { item_name: string; unit: string; used: number; used_cost: number; purchased: number; purchased_cost: number; wasted: number; wasted_cost: number }[];
  const l = (loyalty.data ?? {}) as Record<string, number> & { game_rewards?: { game: string; rounds: number; points: number; coupons: number }[] };

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description={`${dateOnly(from)} – ${dateOnly(to)} · Asia/Manila days · sales dated by completion`} actions={<DateRangeFilter from={from} to={to} />} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Net sales" value={peso(sum.net_sales)} hint={`${sum.orders} orders · avg ${peso(sum.average_order_value)}`} />
        <Stat label="Cash received" value={peso(sum.cash_received)} />
        <Stat label="Digital payments" value={peso(sum.digital_received)} />
        <Stat label="Est. net operating profit" value={peso(sum.net_operating_profit)} tone={sum.net_operating_profit < 0 ? "bad" : undefined} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Sales & profit statement" description="Estimated food gross profit vs. net operating profit" />
          <CardBody>
            <Ledger rows={[
              { label: "Gross sales", value: peso(sum.gross_sales), hint: `incl. ${peso(sum.packaging_fees)} packaging fees` },
              { label: "Discounts (promos, rewards, manual)", value: `−${peso(sum.discounts)}`, negative: true },
              { label: "Refunds", value: `−${peso(sum.refunds)}`, negative: true },
              { label: "Net sales", value: peso(sum.net_sales), strong: true },
              { label: "Est. cost of goods sold", value: `−${peso(sum.cogs)}`, negative: true, hint: "Recipe cost snapshot at time of sale" },
              { label: "Est. gross profit", value: `${peso(sum.gross_profit)} (${percent(sum.gross_margin)})`, strong: true },
              ...Object.entries(sum.expenses_by_category).map(([k, v]) => ({ label: EXPENSE_LABEL[k] ?? k, value: `−${peso(v)}`, negative: true })),
              { label: "Est. net operating profit", value: peso(sum.net_operating_profit), strong: true, negative: sum.net_operating_profit < 0 },
            ]} />
            <p className="mt-3 text-xs text-ink-muted">Voids in range: {sum.voids_count} ({peso(sum.voids_amount)}). Cancelled orders: {sum.cancelled_orders}. Net operating profit is an estimate before tax and excludes costs you haven&apos;t recorded.</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Payments" description="Verified payments on completed orders" />
          <CardBody className="space-y-4">
            {sum.payments_by_method.length ? <RankedBars valueLabel="Collected" data={sum.payments_by_method.map((p) => ({ label: p.method, value: p.amount, note: `${p.count} payments` }))} /> : <EmptyState title="No payments" />}
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Dine-in" value={peso(sum.dine_in_sales)} hint={`${sum.dine_in_orders} orders`} />
              <Stat label="Takeout" value={peso(sum.takeout_sales)} hint={`${sum.takeout_orders} orders`} />
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {[{ title: "Daily", rows: daily.map((d) => ({ label: dateOnly(d.day), orders: d.orders, net: d.net_sales, profit: d.gross_profit })) }, { title: "Weekly", rows: [...weeks.values()] }, { title: "Monthly", rows: [...months.values()] }].map((t) => (
          <Card key={t.title}>
            <CardHeader title={`${t.title} sales`} action={t.title === "Daily" ? <Csv report="daily" from={from} to={to} /> : undefined} />
            <div className="max-h-96 overflow-auto">
              <Table>
                <thead><tr><Th>Period</Th><Th className="text-right">Orders</Th><Th className="text-right">Net sales</Th><Th className="text-right">Gross profit</Th></tr></thead>
                <tbody>{t.rows.map((r) => <Tr key={r.label}><Td className="whitespace-nowrap">{r.label}</Td><Td className="text-right">{r.orders}</Td><Td className="text-right tabular-nums">{peso(r.net)}</Td><Td className="text-right tabular-nums">{peso(r.profit)}</Td></Tr>)}</tbody>
              </Table>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader title="Sales by product" description="Quantity, revenue and estimated profit (net of refunds)" action={<Csv report="products" from={from} to={to} />} />
        {products.length === 0 ? <EmptyState title="No sales in this range" /> : (
          <Table>
            <thead><tr><Th>Product</Th><Th>Category</Th><Th className="text-right">Qty</Th><Th className="text-right">Revenue</Th><Th className="text-right">Est. cost</Th><Th className="text-right">Est. profit</Th><Th className="text-right">Margin</Th></tr></thead>
            <tbody>{products.map((p) => (
              <Tr key={`${p.product_id}-${p.product_name}`}><Td className="font-semibold">{p.product_name}</Td><Td className="text-ink-muted">{p.category_name}</Td><Td className="text-right">{p.quantity}</Td><Td className="text-right tabular-nums">{peso(p.revenue)}</Td><Td className="text-right tabular-nums">{peso(p.cost)}</Td><Td className="text-right tabular-nums">{peso(p.gross_profit)}</Td><Td className="text-right">{percent(p.margin)}</Td></Tr>
            ))}</tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader title="Ingredient consumption, purchases & spoilage" action={<Csv report="ingredients" from={from} to={to} />} />
        {ing.length === 0 ? <EmptyState title="No stock movements in this range" /> : (
          <Table>
            <thead><tr><Th>Ingredient</Th><Th className="text-right">Used</Th><Th className="text-right">Used cost</Th><Th className="text-right">Purchased</Th><Th className="text-right">Purchase cost</Th><Th className="text-right">Spoiled</Th><Th className="text-right">Spoilage cost</Th></tr></thead>
            <tbody>
              {ing.map((i) => (
                <Tr key={i.item_name}>
                  <Td className="font-semibold">{i.item_name}</Td>
                  <Td className="text-right tabular-nums">{num(i.used, 3)} {UNIT_LABEL[i.unit]}</Td><Td className="text-right tabular-nums">{peso(i.used_cost)}</Td>
                  <Td className="text-right tabular-nums">{num(i.purchased, 3)}</Td><Td className="text-right tabular-nums">{peso(i.purchased_cost)}</Td>
                  <Td className="text-right tabular-nums">{num(i.wasted, 3)}</Td><Td className="text-right tabular-nums">{peso(i.wasted_cost)}</Td>
                </Tr>
              ))}
              <Tr>
                <Td className="font-bold">Totals</Td><Td /><Td className="text-right font-bold tabular-nums">{peso(ing.reduce((s, i) => s + Number(i.used_cost), 0))}</Td><Td />
                <Td className="text-right font-bold tabular-nums">{peso(ing.reduce((s, i) => s + Number(i.purchased_cost), 0))}</Td><Td />
                <Td className="text-right font-bold tabular-nums">{peso(ing.reduce((s, i) => s + Number(i.wasted_cost), 0))}</Td>
              </Tr>
            </tbody>
          </Table>
        )}
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Staff transactions" description="POS sales, discounts, voids and refunds by staff member" action={<Csv report="staff" from={from} to={to} />} />
          {(staff.data ?? []).length === 0 ? <EmptyState title="No staff activity" /> : (
            <Table>
              <thead><tr><Th>Staff</Th><Th className="text-right">Orders</Th><Th className="text-right">Sales</Th><Th className="text-right">Discounts</Th><Th className="text-right">Voids</Th><Th className="text-right">Refunds</Th></tr></thead>
              <tbody>{(staff.data ?? []).map((s: { staff_id: string; staff_name: string; orders: number; sales: number; discounts: number; voids: number; void_amount: number; refunds: number; refund_amount: number }) => (
                <Tr key={s.staff_id}><Td className="font-semibold">{s.staff_name}</Td><Td className="text-right">{s.orders}</Td><Td className="text-right tabular-nums">{peso(s.sales)}</Td><Td className="text-right tabular-nums">{peso(s.discounts)}</Td><Td className="text-right">{s.voids} · {peso(s.void_amount)}</Td><Td className="text-right">{s.refunds} · {peso(s.refund_amount)}</Td></Tr>
              ))}</tbody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader title="Loyalty & Play Zone" />
          <CardBody className="space-y-4">
            <Ledger rows={[
              { label: "Points earned from orders", value: num(l.points_earned, 0) },
              { label: "Points won in games", value: num(l.points_from_games, 0) },
              { label: "Points redeemed", value: num(l.points_redeemed, 0) },
              { label: "Points reversed (refunds/cancels)", value: num(l.points_reversed, 0) },
              { label: "Manual adjustments", value: num(l.points_adjusted, 0) },
              { label: "Reward codes issued / used", value: `${l.redemptions_issued ?? 0} / ${l.redemptions_used ?? 0}` },
              { label: "Discount given via rewards", value: peso(l.reward_discounts) },
            ]} />
            <Table>
              <thead><tr><Th>Game</Th><Th className="text-right">Rounds</Th><Th className="text-right">Points</Th><Th className="text-right">Coupons</Th></tr></thead>
              <tbody>{(l.game_rewards ?? []).map((g) => <Tr key={g.game}><Td>{g.game}</Td><Td className="text-right">{g.rounds}</Td><Td className="text-right">{g.points}</Td><Td className="text-right">{g.coupons}</Td></Tr>)}</tbody>
            </Table>
          </CardBody>
        </Card>
      </div>
      <div className="flex flex-wrap gap-2">
        <Csv report="orders" from={from} to={to} />
        <ButtonLink href={`/api/export/expenses?from=${from}&to=${to}`} variant="outline" size="sm"><Download /> Expenses CSV</ButtonLink>
      </div>
    </div>
  );
}
