import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { Stat } from "@/components/admin/stat";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { addDays, dateTime, manilaToday } from "@/lib/format";
import { getStoreSettings } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import type { Reward } from "@/lib/types";
import { RewardsManager, RulesForm } from "./rewards-manager";

export const metadata: Metadata = { title: "Loyalty & rewards" };

export default async function RewardsAdminPage() {
  const supabase = await createClient();
  const today = manilaToday();
  const [settings, { data: rewards }, { data: products }, { data: recent }, loyalty] = await Promise.all([
    getStoreSettings(),
    supabase.from("rewards").select("*").order("is_redeemable", { ascending: false }).order("points_cost"),
    supabase.from("products").select("id, name").eq("is_archived", false).order("name"),
    supabase.from("reward_redemptions").select("id, code, status, source, points_spent, created_at, used_at, rewards(name), profiles:customer_id(full_name)").order("created_at", { ascending: false }).limit(30),
    supabase.rpc("report_loyalty", { p_from: addDays(today, -29), p_to: today }),
  ]);
  const usage = new Map<string, number>();
  const { data: counts } = await supabase.from("reward_redemptions").select("reward_id").neq("status", "cancelled");
  for (const c of counts ?? []) usage.set(c.reward_id, (usage.get(c.reward_id) ?? 0) + 1);
  const l = (loyalty.data ?? {}) as Record<string, number>;

  return (
    <div className="space-y-6">
      <PageHeader title="Loyalty & rewards" description="Points rules, the rewards catalogue and recent redemptions." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Earned (30d)" value={l.points_earned ?? 0} hint="From completed orders" />
        <Stat label="From games (30d)" value={l.points_from_games ?? 0} />
        <Stat label="Redeemed (30d)" value={l.points_redeemed ?? 0} />
        <Stat label="Codes used (30d)" value={l.redemptions_used ?? 0} />
        <Stat label="Outstanding balance" value={l.outstanding_balance ?? 0} hint="All customers" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <Card>
          <CardHeader title="Points rules" description="Applied when an order is placed; awarded once it's completed and paid." />
          <CardBody><RulesForm settings={settings} /></CardBody>
        </Card>
        <RewardsManager rewards={((rewards ?? []) as Reward[]).map((r) => ({ ...r, value: Number(r.value), used: usage.get(r.id) ?? 0 }))} products={products ?? []} />
      </div>
      <Card>
        <CardHeader title="Recent redemptions" />
        <Table>
          <thead><tr><Th>When</Th><Th>Customer</Th><Th>Reward</Th><Th>Code</Th><Th>Source</Th><Th>Status</Th></tr></thead>
          <tbody>
            {(recent ?? []).map((r) => (
              <Tr key={r.id}>
                <Td className="whitespace-nowrap">{dateTime(r.created_at)}</Td>
                <Td>{(r.profiles as unknown as { full_name: string } | null)?.full_name}</Td>
                <Td>{(r.rewards as unknown as { name: string } | null)?.name}</Td>
                <Td className="font-mono">{r.code}</Td>
                <Td>{r.source === "points" ? `${r.points_spent} pts` : r.source}</Td>
                <Td>{r.status}{r.used_at ? ` · ${dateTime(r.used_at)}` : ""}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
