"use client";

import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { dateOnly, peso } from "@/lib/format";
import { savePromotion, type FormState } from "../rewards/actions";

export type Promo = {
  id: string; name: string; description: string; code: string | null; discount_type: "percent" | "fixed"; value: number; min_subtotal: number;
  starts_at: string | null; ends_at: string | null; applies_online: boolean; applies_pos: boolean; is_active: boolean; uses?: number; discounted?: number;
};

const toDay = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date(iso)) : "");

export function PromotionsManager({ promos }: { promos: Promo[] }) {
  const [editing, setEditing] = useState<Promo | "new" | null>(null);
  const router = useRouter();
  return (
    <>
      <div className="mb-4"><Button onClick={() => setEditing("new")}><Plus /> New promotion</Button></div>
      <Card>
        <Table>
          <thead><tr><Th>Promotion</Th><Th>Code</Th><Th>Discount</Th><Th>Window</Th><Th>Where</Th><Th className="text-right">Used</Th><Th /></tr></thead>
          <tbody>
            {promos.map((p) => (
              <Tr key={p.id}>
                <Td><span className="font-semibold">{p.name}</span> {!p.is_active ? <Badge>Off</Badge> : null}<br /><span className="text-xs text-ink-muted">{p.description}</span></Td>
                <Td className="font-mono">{p.code ?? "—"}</Td>
                <Td>{p.discount_type === "percent" ? `${p.value}%` : peso(p.value)}{p.min_subtotal > 0 ? <span className="block text-xs text-ink-muted">min {peso(p.min_subtotal)}</span> : null}</Td>
                <Td className="text-xs">{p.starts_at ? dateOnly(p.starts_at) : "Now"} – {p.ends_at ? dateOnly(p.ends_at) : "no end"}</Td>
                <Td className="text-xs">{[p.applies_online && "Online", p.applies_pos && "POS"].filter(Boolean).join(", ")}</Td>
                <Td className="text-right text-sm">{p.uses}×<br /><span className="text-xs text-ink-muted">{peso(p.discounted)}</span></Td>
                <Td><Button size="sm" variant="outline" onClick={() => setEditing(p)}><Pencil /> Edit</Button></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
      {editing ? <PromoDialog promo={editing === "new" ? null : editing} onClose={() => { setEditing(null); router.refresh(); }} /> : null}
    </>
  );
}

function PromoDialog({ promo, onClose }: { promo: Promo | null; onClose: () => void }) {
  const [state, action] = useActionState<FormState, FormData>(savePromotion, {});
  useEffect(() => { if (state.saved) onClose(); }, [state.saved, onClose]);
  return (
    <Dialog open onClose={onClose} title={promo ? `Edit ${promo.name}` : "New promotion"}>
      <form action={action} className="space-y-3">
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}
        <input type="hidden" name="id" value={promo?.id ?? ""} />
        <Field label="Name" htmlFor="p-name"><Input id="p-name" name="name" defaultValue={promo?.name} required maxLength={100} /></Field>
        <Field label="Description (shown to customers)" htmlFor="p-desc"><Textarea id="p-desc" name="description" defaultValue={promo?.description} maxLength={300} className="min-h-14" /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Code" htmlFor="p-code"><Input id="p-code" name="code" defaultValue={promo?.code ?? ""} maxLength={20} className="font-mono uppercase" /></Field>
          <Field label="Type" htmlFor="p-type"><Select id="p-type" name="discount_type" defaultValue={promo?.discount_type ?? "fixed"}><option value="fixed">₱ off</option><option value="percent">% off</option></Select></Field>
          <Field label="Value" htmlFor="p-val"><Input id="p-val" name="value" type="number" min={0.01} step="0.01" defaultValue={promo?.value} required /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Minimum order (₱)" htmlFor="p-min"><Input id="p-min" name="min_subtotal" type="number" min={0} step="0.01" defaultValue={promo?.min_subtotal ?? 0} /></Field>
          <Field label="Starts" htmlFor="p-start"><Input id="p-start" name="starts_at" type="date" defaultValue={toDay(promo?.starts_at ?? null)} /></Field>
          <Field label="Ends" htmlFor="p-end"><Input id="p-end" name="ends_at" type="date" defaultValue={toDay(promo?.ends_at ?? null)} /></Field>
        </div>
        <div className="flex flex-wrap gap-4">
          <Checkbox name="applies_online" label="Online checkout" defaultChecked={promo?.applies_online ?? true} />
          <Checkbox name="applies_pos" label="POS" defaultChecked={promo?.applies_pos ?? true} />
          <Checkbox name="is_active" label="Active" defaultChecked={promo?.is_active ?? true} />
        </div>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><SubmitButton pendingText="Saving…">Save</SubmitButton></div>
      </form>
    </Dialog>
  );
}
