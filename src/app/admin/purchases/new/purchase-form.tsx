"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { Table } from "@/components/ui/table";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { peso } from "@/lib/format";
import type { StockUnit } from "@/lib/types";
import { createPurchase } from "../../inventory/actions";

type Item = { id: string; name: string; sku: string; unit: StockUnit; last_purchase_cost: number; supplier_id: string | null };
type Line = { key: string; item_id: string; quantity: string; unit: StockUnit; unit_cost: string; expiration_date: string };

const DIM: Record<StockUnit, string> = { kg: "m", g: "m", l: "v", ml: "v", pc: "pc", pack: "pack", bottle: "bottle" };

export function PurchaseForm({ today, items, suppliers }: { today: string; items: Item[]; suppliers: { id: string; name: string }[] }) {
  const [supplier, setSupplier] = useState("");
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [receiveNow, setReceiveNow] = useState(true);
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();
  const byId = new Map(items.map((i) => [i.id, i]));
  const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_cost) || 0), 0);
  const visibleItems = supplier ? [...items].sort((a, b) => Number(b.supplier_id === supplier) - Number(a.supplier_id === supplier)) : items;

  const update = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  return (
    <Card>
      <CardBody className="space-y-4">
        {error ? <Alert tone="error">{error}</Alert> : null}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Supplier" htmlFor="po-sup">
            <Select id="po-sup" value={supplier} onChange={(e) => setSupplier(e.target.value)}>
              <option value="">— none / market —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Date" htmlFor="po-date"><Input id="po-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        <Table className="md:min-w-[720px] [&_td]:py-2 md:[&_td]:pr-2">
            <thead><tr className="text-left text-xs font-bold uppercase text-wood-600"><th className="pb-2">Item</th><th className="pb-2">Quantity</th><th className="pb-2">Unit</th><th className="pb-2">Cost per unit (₱)</th><th className="pb-2">Expiry</th><th className="pb-2 text-right">Line total</th><th /></tr></thead>
            <tbody>
              {lines.map((l) => {
                const it = byId.get(l.item_id);
                return (
                  <tr key={l.key} className="border-t border-bamboo-300/40">
                    <td className="py-2 pr-2">
                      <Select aria-label="Item" value={l.item_id} onChange={(e) => {
                        const n = byId.get(e.target.value);
                        update(l.key, { item_id: e.target.value, unit: n?.unit ?? "pc", unit_cost: n?.last_purchase_cost ? String(n.last_purchase_cost) : "" });
                      }} className="h-10">
                        <option value="" disabled>Choose item…</option>
                        {visibleItems.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.sku})</option>)}
                      </Select>
                    </td>
                    <td className="py-2 pr-2"><Input aria-label="Quantity" type="number" min={0} step="any" value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} className="h-10 w-24" /></td>
                    <td className="py-2 pr-2">
                      <Select aria-label="Unit" value={l.unit} onChange={(e) => update(l.key, { unit: e.target.value as StockUnit })} className="h-10 w-24" disabled={!it}>
                        {(Object.keys(DIM) as StockUnit[]).filter((u) => !it || DIM[u] === DIM[it.unit]).map((u) => <option key={u} value={u}>{u}</option>)}
                      </Select>
                    </td>
                    <td className="py-2 pr-2"><Input aria-label="Unit cost" type="number" min={0} step="any" value={l.unit_cost} onChange={(e) => update(l.key, { unit_cost: e.target.value })} className="h-10 w-28" /></td>
                    <td className="py-2 pr-2"><Input aria-label="Expiry date" type="date" value={l.expiration_date} onChange={(e) => update(l.key, { expiration_date: e.target.value })} className="h-10 w-40" /></td>
                    <td className="py-2 text-right tabular-nums">{peso((Number(l.quantity) || 0) * (Number(l.unit_cost) || 0))}</td>
                    <td className="py-2 pl-1"><Button variant="ghost" size="icon" aria-label="Remove" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><Trash2 /></Button></td>
                  </tr>
                );
              })}
            </tbody>
        </Table>
        <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { key: crypto.randomUUID(), item_id: "", quantity: "", unit: "kg", unit_cost: "", expiration_date: "" }])}><Plus /> Add item</Button>
        <Field label="Notes (invoice no., remarks)" htmlFor="po-notes"><Textarea id="po-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} className="min-h-14" /></Field>
        <Checkbox label="Goods already received — add to stock now" checked={receiveNow} onChange={(e) => setReceiveNow(e.target.checked)} />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-bamboo-300/50 pt-4">
          <p className="font-display text-2xl font-bold text-wood-800">Total {peso(total)}</p>
          <Button
            size="lg"
            disabled={busy || lines.length === 0 || lines.some((l) => !l.item_id || !(Number(l.quantity) > 0) || l.unit_cost === "")}
            onClick={() => start(async () => {
              setError(null);
              const res = await createPurchase({
                supplier_id: supplier || null,
                order_date: date,
                notes,
                receive_now: receiveNow,
                items: lines.map((l) => ({ inventory_item_id: l.item_id, quantity: Number(l.quantity), unit: l.unit, unit_cost: Number(l.unit_cost), expiration_date: l.expiration_date || null })),
              });
              if (!res.ok) return setError(res.error);
              router.push(`/admin/purchases/${res.data.id}`);
            })}
          >
            {busy ? <Loader2 className="animate-spin" /> : null} {receiveNow ? "Save & receive stock" : "Save as ordered"}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
