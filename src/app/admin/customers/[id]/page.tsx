import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { Stat } from "@/components/admin/stat";
import { Badge, OrderStatusBadge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { dateOnly, dateTime, peso } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { formatPhone, isInternalEmail } from "@/lib/account";
import { AdjustPoints, CancelCode, ResetPassword } from "./customer-actions";

export default async function CustomerPage(props: PageProps<"/admin/customers/[id]">) {
  const { id } = await props.params;
  const supabase = await createClient();
  const { data: c } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
  if (!c) notFound();
  const [{ data: orders }, { data: ledger }, { data: codes }, { data: games }] = await Promise.all([
    supabase.from("orders").select("id, order_number, status, total, refunded_total, created_at").eq("customer_id", id).order("created_at", { ascending: false }).limit(50),
    supabase.from("loyalty_ledger").select("*").eq("customer_id", id).order("created_at", { ascending: false }).limit(50),
    supabase.from("reward_redemptions").select("*, rewards(name)").eq("customer_id", id).order("created_at", { ascending: false }).limit(50),
    supabase.from("game_sessions").select("game_code, status, score, prize_label, started_at").eq("customer_id", id).order("started_at", { ascending: false }).limit(20),
  ]);
  const completed = (orders ?? []).filter((o) => o.status === "completed");
  return (
    <div className="space-y-5">
      <Link href="/admin/customers" className="inline-flex items-center gap-1.5 text-sm font-semibold text-forest-700 hover:underline"><ArrowLeft className="size-4" /> Customers</Link>
      <PageHeader title={c.full_name || c.username || c.email} actions={<ResetPassword customerId={id} />} description={`${c.username ? `@${c.username}` : isInternalEmail(c.email) ? "" : c.email}${c.phone ? ` · ${formatPhone(c.phone)}` : ""}${c.student_school ? ` · ${c.student_school}` : ""} · joined ${dateOnly(c.created_at)}`} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Points balance" value={c.points_balance} hint={<span className="inline-flex items-center gap-2">{c.game_tokens} game tokens <AdjustPoints customerId={id} kind="tokens" /></span>} />
        <Stat label="Completed orders" value={completed.length} />
        <Stat label="Lifetime spend" value={peso(completed.reduce((s, o) => s + Number(o.total) - Number(o.refunded_total), 0))} />
        <Stat label="Rewards redeemed" value={(codes ?? []).filter((r) => r.status === "used").length} />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Orders" />
          <Table>
            <thead><tr><Th>Order</Th><Th>Date</Th><Th>Status</Th><Th className="text-right">Total</Th></tr></thead>
            <tbody>{(orders ?? []).map((o) => (
              <Tr key={o.id}><Td><Link href={`/admin/orders/${o.id}`} className="font-mono hover:underline">{o.order_number}</Link></Td><Td>{dateTime(o.created_at)}</Td><Td><OrderStatusBadge status={o.status} /></Td><Td className="text-right tabular-nums">{peso(o.total)}</Td></Tr>
            ))}</tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Points ledger" action={<AdjustPoints customerId={id} />} />
          <Table>
            <thead><tr><Th>When</Th><Th>Entry</Th><Th className="text-right">Points</Th></tr></thead>
            <tbody>{(ledger ?? []).map((l) => (
              <Tr key={l.id}><Td className="whitespace-nowrap">{dateTime(l.created_at)}</Td><Td><span className="font-semibold">{l.entry_type.replace("_", " ")}</span><br /><span className="text-xs text-ink-muted">{l.description}</span></Td><Td className={`text-right font-bold ${l.points > 0 ? "text-leaf-700" : "text-terracotta-600"}`}>{l.points > 0 ? "+" : ""}{l.points}</Td></Tr>
            ))}</tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Reward codes" />
          <Table>
            <thead><tr><Th>Reward</Th><Th>Code</Th><Th>Status</Th><Th /></tr></thead>
            <tbody>{(codes ?? []).map((r) => (
              <Tr key={r.id}>
                <Td>{(r.rewards as { name: string } | null)?.name}<br /><span className="text-xs text-ink-muted">{r.source} · {dateOnly(r.created_at)}</span></Td>
                <Td className="font-mono">{r.code}</Td>
                <Td><Badge tone={r.status === "used" ? "green" : r.status === "issued" ? "gold" : "neutral"}>{r.status === "issued" && new Date(r.expires_at) < new Date() ? "expired" : r.status}</Badge></Td>
                <Td>{r.status === "issued" ? <CancelCode id={r.id} /> : null}</Td>
              </Tr>
            ))}</tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Recent games" />
          <CardBody className="space-y-1 text-sm">
            {(games ?? []).length === 0 ? <p className="text-ink-muted">No games played.</p> : (games ?? []).map((g, i) => (
              <p key={i} className="flex justify-between gap-2"><span>{g.game_code} · {dateTime(g.started_at)}</span><span className="text-ink-muted">{g.status === "completed" ? `${g.score ?? ""} ${g.prize_label ?? ""}` : g.status}</span></p>
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
