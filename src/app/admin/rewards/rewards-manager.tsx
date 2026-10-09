"use client";

import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { dateOnly, peso } from "@/lib/format";
import type { Reward, StoreSettings } from "@/lib/types";
import { saveLoyaltyRules, saveReward, type FormState } from "./actions";

export function RulesForm({ settings }: { settings: StoreSettings }) {
  const [state, action] = useActionState<FormState, FormData>(saveLoyaltyRules, {});
  return (
    <form action={action} className="space-y-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.saved ? <Alert tone="success">Rules saved. They apply to new orders.</Alert> : null}
      <Checkbox name="points_enabled" label="Loyalty points are on" defaultChecked={settings.points_enabled} />
      <Field label="Price threshold (₱)" htmlFor="thr" hint="Meals priced at or below this earn the lower amount.">
        <Input id="thr" name="points_price_threshold" type="number" min={0} step="0.01" defaultValue={settings.points_price_threshold} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Points at or below" htmlFor="low"><Input id="low" name="points_at_or_below" type="number" min={0} step={1} defaultValue={settings.points_at_or_below} /></Field>
        <Field label="Points above" htmlFor="high"><Input id="high" name="points_above" type="number" min={0} step={1} defaultValue={settings.points_above} /></Field>
      </div>
      <Checkbox name="points_on_addons" label="Add-ons earn points too" defaultChecked={settings.points_on_addons} />
      <p className="text-xs text-ink-muted">Which items earn points is set per menu item (“Earns loyalty points”). Drinks and add-ons are off by default.</p>
      <SubmitButton pendingText="Saving…">Save rules</SubmitButton>
    </form>
  );
}

type Row = Reward & { used: number };

export function RewardsManager({ rewards, products }: { rewards: Row[]; products: { id: string; name: string }[] }) {
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const router = useRouter();
  const describe = (r: Reward) => (r.reward_type === "free_product" ? `Free ${products.find((p) => p.id === r.product_id)?.name ?? "item"}` : r.reward_type === "fixed_discount" ? `${peso(r.value)} off` : `${r.value}% off`);
  return (
    <Card>
      <CardHeader title="Rewards catalogue" action={<Button size="sm" onClick={() => setEditing("new")}><Plus /> New reward</Button>} />
      <Table>
        <thead><tr><Th>Reward</Th><Th>Gives</Th><Th className="text-right">Cost</Th><Th>Limits</Th><Th>Status</Th><Th /></tr></thead>
        <tbody>
          {rewards.map((r) => (
            <Tr key={r.id}>
              <Td className="font-semibold">{r.name}</Td>
              <Td>{describe(r)}</Td>
              <Td className="text-right">{r.is_redeemable ? `${r.points_cost} pts` : <Badge tone="purple">Game prize</Badge>}</Td>
              <Td className="text-xs text-ink-muted">{r.used} issued{r.total_limit ? ` / ${r.total_limit}` : ""}{r.per_customer_limit ? ` · ${r.per_customer_limit} per customer` : ""} · valid {r.valid_days}d{r.expires_at ? ` · ends ${dateOnly(r.expires_at)}` : ""}</Td>
              <Td><Badge tone={r.is_active ? "green" : "neutral"}>{r.is_active ? "Active" : "Inactive"}</Badge></Td>
              <Td><Button size="sm" variant="outline" onClick={() => setEditing(r)}><Pencil /> Edit</Button></Td>
            </Tr>
          ))}
        </tbody>
      </Table>
      {editing ? <RewardDialog reward={editing === "new" ? null : editing} products={products} onClose={() => { setEditing(null); router.refresh(); }} /> : null}
    </Card>
  );
}

function RewardDialog({ reward, products, onClose }: { reward: Reward | null; products: { id: string; name: string }[]; onClose: () => void }) {
  const [state, action] = useActionState<FormState, FormData>(saveReward, {});
  const [type, setType] = useState(reward?.reward_type ?? "fixed_discount");
  useEffect(() => { if (state.saved) onClose(); }, [state.saved, onClose]);
  return (
    <Dialog open onClose={onClose} title={reward ? `Edit ${reward.name}` : "New reward"}>
      <form action={action} className="space-y-3">
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}
        <input type="hidden" name="id" value={reward?.id ?? ""} />
        <Field label="Name" htmlFor="rw-name"><Input id="rw-name" name="name" defaultValue={reward?.name} required maxLength={100} /></Field>
        <Field label="Description" htmlFor="rw-desc"><Textarea id="rw-desc" name="description" defaultValue={reward?.description} maxLength={300} className="min-h-14" /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type" htmlFor="rw-type">
            <Select id="rw-type" name="reward_type" value={type} onChange={(e) => setType(e.target.value as Reward["reward_type"])}>
              <option value="fixed_discount">₱ off the order</option>
              <option value="percent_discount">% off the order</option>
              <option value="free_product">Free menu item</option>
            </Select>
          </Field>
          {type === "free_product" ? (
            <Field label="Free item" htmlFor="rw-prod">
              <Select id="rw-prod" name="product_id" defaultValue={reward?.product_id ?? ""} required>
                <option value="" disabled>Choose…</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
          ) : (
            <Field label={type === "percent_discount" ? "Percent off" : "Pesos off"} htmlFor="rw-val"><Input id="rw-val" name="value" type="number" min={0} step="0.01" defaultValue={reward?.value} required /></Field>
          )}
        </div>
        <Checkbox name="is_redeemable" label="Customers can redeem it with points (untick for game-only prizes)" defaultChecked={reward?.is_redeemable ?? true} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Points needed" htmlFor="rw-cost"><Input id="rw-cost" name="points_cost" type="number" min={0} step={1} defaultValue={reward?.points_cost ?? 10} /></Field>
          <Field label="Per customer limit" htmlFor="rw-pcl" hint="Blank = no limit"><Input id="rw-pcl" name="per_customer_limit" type="number" min={1} step={1} defaultValue={reward?.per_customer_limit ?? ""} /></Field>
          <Field label="Total limit" htmlFor="rw-tl" hint="Blank = no limit"><Input id="rw-tl" name="total_limit" type="number" min={1} step={1} defaultValue={reward?.total_limit ?? ""} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Code valid for (days)" htmlFor="rw-days"><Input id="rw-days" name="valid_days" type="number" min={1} max={365} defaultValue={reward?.valid_days ?? 30} /></Field>
          <Field label="Catalogue end date (optional)" htmlFor="rw-exp"><Input id="rw-exp" name="expires_at" type="date" defaultValue={reward?.expires_at ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date(reward.expires_at)) : ""} /></Field>
        </div>
        <Checkbox name="is_active" label="Active" defaultChecked={reward?.is_active ?? true} />
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><SubmitButton pendingText="Saving…">Save reward</SubmitButton></div>
      </form>
    </Dialog>
  );
}
