import type { Metadata } from "next";
import { DateRangeFilter } from "@/components/admin/date-range";
import { PageHeader } from "@/components/admin/page-header";
import { Stat } from "@/components/admin/stat";
import { dateRange } from "@/lib/admin";
import { manilaToday, peso } from "@/lib/format";
import { EXPENSE_LABEL } from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";
import { ExpenseManager } from "./expense-manager";

export const metadata: Metadata = { title: "Expenses" };

export default async function ExpensesPage(props: PageProps<"/admin/expenses">) {
  const sp = await props.searchParams;
  const { from, to } = dateRange(sp, 30);
  const supabase = await createClient();
  const { data } = await supabase.from("operating_expenses").select("*").gte("expense_date", from).lte("expense_date", to).order("expense_date", { ascending: false });
  const rows = (data ?? []).map((e) => ({ ...e, amount: Number(e.amount) }));
  const byCat = new Map<string, number>();
  for (const e of rows) byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount);
  return (
    <div className="space-y-5">
      <PageHeader title="Operating expenses" description="Labor, rent, utilities and other costs. These are subtracted from gross profit to estimate net operating profit." />
      <DateRangeFilter from={from} to={to} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total" value={peso(rows.reduce((s, e) => s + e.amount, 0))} />
        {[...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => <Stat key={k} label={EXPENSE_LABEL[k]} value={peso(v)} />)}
      </div>
      <ExpenseManager rows={rows} today={manilaToday()} />
    </div>
  );
}
