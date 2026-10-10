import { Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { PrintButton } from "@/components/admin/report-section";
import { Stat } from "@/components/admin/stat";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { formatPhone, isInternalEmail } from "@/lib/account";
import { addDays, dateOnly, manilaToday, peso } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage(props: PageProps<"/admin/customers">) {
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().replace(/[%,()*]/g, "").slice(0, 60) : "";
  const supabase = await createClient();
  let query = supabase.from("profiles").select("id, full_name, username, email, phone, points_balance, created_at, is_active").eq("role", "customer").order("created_at", { ascending: false }).limit(200);
  if (q) query = query.or(`full_name.ilike.%${q}%,username.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`);
  const today = manilaToday();
  const [{ data: customers }, { count }, top] = await Promise.all([
    query,
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "customer"),
    supabase.rpc("report_top_customers", { p_from: addDays(today, -89), p_to: today, p_limit: 10 }),
  ]);
  const totalPoints = (customers ?? []).reduce((s, c) => s + c.points_balance, 0);

  return (
    <div className="space-y-5">
      <PageHeader title="Customers" description="Accounts, points balances and order history." actions={<PrintButton />} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Customer accounts" value={count ?? 0} />
        <Stat label="Points outstanding (shown)" value={totalPoints} />
      </div>
      <Card>
        <CardHeader title="Most frequent customers" description="Completed orders in the last 90 days" />
        {!(top.data ?? []).length ? <EmptyState title="No completed orders from account holders yet" /> : (
          <Table>
            <thead><tr><Th>Customer</Th><Th className="text-right">Orders</Th><Th className="text-right">Spent</Th><Th className="text-right">Points</Th></tr></thead>
            <tbody>
              {(top.data ?? []).map((c: { customer_id: string; full_name: string; email: string; orders: number; spent: number; points_balance: number }) => (
                <Tr key={c.customer_id}>
                  <Td><Link href={`/admin/customers/${c.customer_id}`} className="font-semibold hover:underline">{c.full_name || c.email}</Link></Td>
                  <Td className="text-right">{c.orders}</Td><Td className="text-right tabular-nums">{peso(c.spent)}</Td><Td className="text-right">{c.points_balance}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Card>
        <CardHeader title="All customers" action={<form action="/admin/customers"><input name="q" defaultValue={q} placeholder="Search name, username, mobile" className="h-9 rounded-xl border border-bamboo-400/70 bg-white/80 px-3 text-sm" aria-label="Search customers" /></form>} />
        {!(customers ?? []).length ? <EmptyState icon={<Users />} title="No customers found" /> : (
          <Table>
            <thead><tr><Th>Name</Th><Th>Username</Th><Th>Mobile</Th><Th className="text-right">Points</Th><Th>Joined</Th></tr></thead>
            <tbody>
              {(customers ?? []).map((c) => (
                <Tr key={c.id}>
                  <Td><Link href={`/admin/customers/${c.id}`} className="font-semibold hover:underline">{c.full_name || "(no name)"}</Link>{!c.is_active ? <span className="ml-1 text-xs text-terracotta-600">deactivated</span> : null}</Td>
                  <Td className="text-sm">{c.username ? `@${c.username}` : isInternalEmail(c.email) ? "—" : c.email}</Td><Td className="text-sm">{formatPhone(c.phone) || "—"}</Td>
                  <Td className="text-right font-semibold">{c.points_balance}</Td><Td>{dateOnly(c.created_at)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
