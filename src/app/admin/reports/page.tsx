import type { Metadata } from "next";
import { RankedBars } from "@/components/admin/charts";
import { DateRangeFilter } from "@/components/admin/date-range";
import { PageHeader } from "@/components/admin/page-header";
import { Ledger, Stat } from "@/components/admin/stat";
import { PrintButton, ReportSection } from "@/components/admin/report-section";
import { CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { dateRange } from "@/lib/admin";
import { getStoreSettings } from "@/lib/data";
import { dateOnly, dateTime, num, peso, percent, UNIT_LABEL } from "@/lib/format";
import { EXPENSE_LABEL, getDailySales, getProductSales, getSummary } from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reports" };

type Week = { label: string; orders: number; net: number; profit: number };

export default async function ReportsPage(props: PageProps<"/admin/reports">) {
  const sp = await props.searchParams;
  const { from, to } = dateRange(sp, 30);
  const supabase = await createClient();
  const [settings, sum, daily, products, ingredients, staff, loyalty] = await Promise.all([
    getStoreSettings(),
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

  const ingTotals = {
    used: ing.reduce((s, i) => s + Number(i.used_cost), 0),
    purchased: ing.reduce((s, i) => s + Number(i.purchased_cost), 0),
    wasted: ing.reduce((s, i) => s + Number(i.wasted_cost), 0),
  };
  const staffRows = (staff.data ?? []) as { staff_id: string; staff_name: string; orders: number; sales: number; discounts: number; voids: number; void_amount: number; refunds: number; refund_amount: number }[];

  return (
    <div className="space-y-6">
      <p className="print-only text-sm text-ink-muted">{settings.store_name} · printed {dateTime(new Date())}</p>
      <PageHeader
        title="Reports"
        description={`${dateOnly(from)} – ${dateOnly(to)} · Asia/Manila days · sales dated by completion`}
        actions={<div className="no-print flex flex-wrap items-end gap-2"><DateRangeFilter from={from} to={to} /><PrintButton /></div>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Net sales" value={peso(sum.net_sales)} hint={`${sum.orders} orders · avg ${peso(sum.average_order_value)}`} />
        <Stat label="Cash received" value={peso(sum.cash_received)} />
        <Stat label="Digital payments" value={peso(sum.digital_received)} />
        <Stat label="Est. net operating profit" value={peso(sum.net_operating_profit)} tone={sum.net_operating_profit < 0 ? "bad" : undefined} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ReportSection title="Sales & profit statement" description="Estimated food gross profit vs. net operating profit" summary={peso(sum.net_operating_profit)}>
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
        </ReportSection>
        <ReportSection title="Payments" description="Verified payments on completed orders" summary={peso(sum.cash_received + sum.digital_received)}>
          <CardBody className="space-y-4">
            {sum.payments_by_method.length ? <RankedBars valueLabel="Collected" data={sum.payments_by_method.map((p) => ({ label: p.method, value: p.amount, note: `${p.count} payments` }))} /> : <EmptyState title="No payments" />}
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Dine-in" value={peso(sum.dine_in_sales)} hint={`${sum.dine_in_orders} orders`} />
              <Stat label="Takeout" value={peso(sum.takeout_sales)} hint={`${sum.takeout_orders} orders`} />
            </div>
          </CardBody>
        </ReportSection>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {[{ title: "Daily", rows: daily.map((d) => ({ label: dateOnly(d.day), orders: d.orders, net: d.net_sales, profit: d.gross_profit })) }, { title: "Weekly", rows: [...weeks.values()] }, { title: "Monthly", rows: [...months.values()] }].map((t) => (
          <ReportSection key={t.title} title={`${t.title} sales`} summary={`${t.rows.length} ${t.title === "Daily" ? "days" : t.title === "Weekly" ? "weeks" : "months"}`}>
            <Table scrollHeight="24rem">
              <thead><tr><Th>Period</Th><Th className="text-right">Orders</Th><Th className="text-right">Net sales</Th><Th className="text-right">Gross profit</Th></tr></thead>
              <tbody>{t.rows.map((r) => <Tr key={r.label}><Td className="whitespace-nowrap">{r.label}</Td><Td className="text-right">{r.orders}</Td><Td className="text-right tabular-nums">{peso(r.net)}</Td><Td className="text-right tabular-nums">{peso(r.profit)}</Td></Tr>)}</tbody>
            </Table>
          </ReportSection>
        ))}
      </div>

      <ReportSection title="Sales by product" description="Quantity, revenue and estimated profit (net of refunds)" summary={`${products.length} items`}>
        {products.length === 0 ? <EmptyState title="No sales in this range" /> : (
          <Table>
            <thead><tr><Th>Product</Th><Th>Category</Th><Th className="text-right">Qty</Th><Th className="text-right">Revenue</Th><Th className="text-right">Est. cost</Th><Th className="text-right">Est. profit</Th><Th className="text-right">Margin</Th></tr></thead>
            <tbody>{products.map((p) => (
              <Tr key={`${p.product_id}-${p.product_name}`}><Td className="font-semibold">{p.product_name}</Td><Td className="text-ink-muted">{p.category_name}</Td><Td className="text-right">{p.quantity}</Td><Td className="text-right tabular-nums">{peso(p.revenue)}</Td><Td className="text-right tabular-nums">{peso(p.cost)}</Td><Td className="text-right tabular-nums">{peso(p.gross_profit)}</Td><Td className="text-right">{percent(p.margin)}</Td></Tr>
            ))}</tbody>
          </Table>
        )}
      </ReportSection>

      <ReportSection title="Ingredient consumption, purchases & spoilage" summary={ing.length ? `Bought ${peso(ingTotals.purchased)}` : undefined}>
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
            </tbody>
          </Table>
        )}
        {ing.length ? (
          <dl className="grid grid-cols-3 gap-2 border-t border-bamboo-300/50 px-5 py-3 text-sm">
            <div><dt className="text-xs font-bold uppercase text-ink-muted">Used</dt><dd className="font-bold tabular-nums">{peso(ingTotals.used)}</dd></div>
            <div><dt className="text-xs font-bold uppercase text-ink-muted">Purchased</dt><dd className="font-bold tabular-nums">{peso(ingTotals.purchased)}</dd></div>
            <div><dt className="text-xs font-bold uppercase text-ink-muted">Spoiled</dt><dd className="font-bold tabular-nums">{peso(ingTotals.wasted)}</dd></div>
          </dl>
        ) : null}
      </ReportSection>

      <div className="grid gap-6 xl:grid-cols-2">
        <ReportSection title="Staff transactions" description="POS sales, discounts, voids and refunds by staff member" summary={staffRows.length ? `${staffRows.length} staff` : undefined}>
          {staffRows.length === 0 ? <EmptyState title="No staff activity" /> : (
            <Table>
              <thead><tr><Th>Staff</Th><Th className="text-right">Orders</Th><Th className="text-right">Sales</Th><Th className="text-right">Discounts</Th><Th className="text-right">Voids</Th><Th className="text-right">Refunds</Th></tr></thead>
              <tbody>{staffRows.map((s) => (
                <Tr key={s.staff_id}><Td className="font-semibold">{s.staff_name}</Td><Td className="text-right">{s.orders}</Td><Td className="text-right tabular-nums">{peso(s.sales)}</Td><Td className="text-right tabular-nums">{peso(s.discounts)}</Td><Td className="text-right">{s.voids} · {peso(s.void_amount)}</Td><Td className="text-right">{s.refunds} · {peso(s.refund_amount)}</Td></Tr>
              ))}</tbody>
            </Table>
          )}
        </ReportSection>
        <ReportSection title="Loyalty & Play Zone" summary={`${num(l.points_earned, 0)} pts earned`}>
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
        </ReportSection>
      </div>
    </div>
  );
}
