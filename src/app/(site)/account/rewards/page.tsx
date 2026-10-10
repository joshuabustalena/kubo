import { Gift, History, Ticket } from "lucide-react";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { getRewardsCatalog, getStoreSettings } from "@/lib/data";
import { dateOnly, dateTime, peso } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { RedeemButton } from "./redeem-button";

export const metadata: Metadata = { title: "Points & rewards" };

const ENTRY_LABEL: Record<string, string> = {
  earn: "Earned",
  earn_reversal: "Refund reversal",
  redeem: "Redeemed",
  redeem_reversal: "Reward cancelled",
  game_reward: "Play Zone prize",
  admin_adjustment: "Adjustment",
};

const isPast = (iso: string) => new Date(iso).getTime() <= Date.now();

export default async function RewardsPage() {
  const user = await requireUser("/account/rewards");
  const supabase = await createClient();
  const [settings, catalog, ledger, codes] = await Promise.all([
    getStoreSettings(),
    getRewardsCatalog(),
    supabase.from("loyalty_ledger").select("*").eq("customer_id", user.id).order("created_at", { ascending: false }).limit(50),
    supabase.from("reward_redemptions").select("*, rewards(name, description)").eq("customer_id", user.id).order("created_at", { ascending: false }).limit(50),
  ]);
  const myCodes = (codes.data ?? []).map((c) => ({
    ...c,
    status: c.status === "issued" && isPast(c.expires_at) ? "expired" : c.status,
    reward: c.rewards as { name: string; description: string } | null,
  }));
  const usable = myCodes.filter((c) => c.status === "issued");
  const past = myCodes.filter((c) => c.status !== "issued");

  return (
    <div className="space-y-6">
      <div className="paper flex flex-wrap items-center gap-4 p-5">
        <div className="grid size-14 place-items-center rounded-2xl bg-gold-100 text-gold-700"><Gift className="size-7" /></div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-3xl font-extrabold text-wood-800">{user.points_balance} points</p>
          <p className="text-sm text-ink-muted">
            Meals {peso(settings.points_price_threshold)} and below earn {settings.points_at_or_below} point; above that, {settings.points_above} points.
            Drinks and add-ons don&apos;t earn points. Points arrive when an order is completed and paid.
          </p>
        </div>
      </div>

      {usable.length > 0 ? (
        <Card>
          <CardHeader title="Ready to use" description="Show the code at the counter, or pick it at checkout." />
          <ul className="grid gap-3 p-5 sm:grid-cols-2">
            {usable.map((c) => (
              <li key={c.id} className="rounded-xl border-2 border-dashed border-forest-600/50 bg-leaf-50 p-4">
                <p className="font-bold text-wood-800">{c.reward?.name}</p>
                <p className="mt-1 font-mono text-2xl font-bold tracking-wider text-forest-800">{c.code}</p>
                <p className="text-xs text-ink-muted">Valid until {dateOnly(c.expires_at)} · {c.source === "game" ? "Play Zone prize" : `${c.points_spent} points`}</p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Rewards catalogue" description="Trade your points for treats." />
        {catalog.length === 0 ? (
          <EmptyState icon={<Ticket />} title="No rewards right now">Check back soon!</EmptyState>
        ) : (
          <ul className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {catalog.map((r) => {
              const short = r.points_cost - user.points_balance;
              return (
                <li key={r.id} className="flex flex-col rounded-xl border border-bamboo-300/60 bg-white/60 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-display text-lg font-bold leading-tight text-wood-800">{r.name}</p>
                    <Badge tone="gold">{r.points_cost} pts</Badge>
                  </div>
                  <p className="mt-1 flex-1 text-sm text-ink-muted">{r.description}</p>
                  {r.per_customer_limit ? <p className="mt-1 text-xs text-ink-muted">Limit {r.per_customer_limit} per customer</p> : null}
                  <div className="mt-3">
                    {short > 0 ? (
                      <p className="text-sm font-semibold text-ink-muted">{short} more points needed</p>
                    ) : (
                      <RedeemButton rewardId={r.id} name={r.name} cost={r.points_cost} />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Points history" />
          {(ledger.data ?? []).length === 0 ? (
            <EmptyState icon={<History />} title="No points yet">Complete an order to start earning.</EmptyState>
          ) : (
            <Table scrollHeight="580px">
              <thead><tr><Th>Date</Th><Th>Details</Th><Th className="text-right">Points</Th></tr></thead>
              <tbody>
                {(ledger.data ?? []).map((l) => (
                  <Tr key={l.id}>
                    <Td className="whitespace-nowrap text-ink-muted">{dateTime(l.created_at)}</Td>
                    <Td><span className="font-semibold">{ENTRY_LABEL[l.entry_type] ?? l.entry_type}</span><br /><span className="text-xs text-ink-muted">{l.description}</span></Td>
                    <Td className={`text-right font-bold ${l.points > 0 ? "text-leaf-700" : "text-terracotta-600"}`}>{l.points > 0 ? `+${l.points}` : l.points}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader title="Redemption history" />
          {past.length === 0 ? (
            <EmptyState icon={<Ticket />} title="Nothing redeemed yet" />
          ) : (
            <Table scrollHeight="580px">
              <thead><tr><Th>Reward</Th><Th>Code</Th><Th>Status</Th></tr></thead>
              <tbody>
                {past.map((c) => (
                  <Tr key={c.id}>
                    <Td><span className="font-semibold">{c.reward?.name}</span><br /><span className="text-xs text-ink-muted">{dateOnly(c.created_at)}</span></Td>
                    <Td className="font-mono">{c.code}</Td>
                    <Td><Badge tone={c.status === "used" ? "green" : "neutral"}>{c.status === "used" ? `Used ${dateOnly(c.used_at)}` : c.status}</Badge></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
