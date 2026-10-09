"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { peso, percent } from "@/lib/format";
import { COST_TYPES, type CostType, type StockUnit } from "@/lib/types";
import { deleteRecipe, saveRecipe } from "../actions";

export type BuilderLine = {
  key: string;
  inventory_item_id: string | null;
  sub_recipe_id: string | null;
  quantity: string;
  unit: StockUnit | null;
  cost_type: CostType;
  applies_to: "all" | "dine_in" | "takeout";
};

type Item = { id: string; name: string; sku: string; unit: StockUnit; avg_cost: number; is_archived: boolean };
type Sub = { id: string; name: string; dine_in_cost: number; takeout_cost: number };

const DIM: Record<StockUnit, string> = { kg: "mass", g: "mass", l: "volume", ml: "volume", pc: "pc", pack: "pack", bottle: "bottle" };
const FACTOR: Record<StockUnit, number> = { kg: 1000, g: 1, l: 1000, ml: 1, pc: 1, pack: 1, bottle: 1 };
const compatible = (u: StockUnit) => (Object.keys(DIM) as StockUnit[]).filter((x) => DIM[x] === DIM[u]);

export function RecipeBuilder({
  recipe,
  price,
  initialLines,
  items,
  subRecipes,
}: {
  recipe: { id: string | null; name: string; yield_servings: number; notes: string; product_id: string | null };
  price: number | null;
  initialLines: BuilderLine[];
  items: Item[];
  subRecipes: Sub[];
}) {
  const [name, setName] = useState(recipe.name);
  const [yieldServings, setYield] = useState(String(recipe.yield_servings));
  const [notes, setNotes] = useState(recipe.notes);
  const [lines, setLines] = useState<BuilderLine[]>(initialLines);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const itemById = new Map(items.map((i) => [i.id, i]));
  const subById = new Map(subRecipes.map((s) => [s.id, s]));

  const lineCost = (l: BuilderLine, service: "dine_in" | "takeout") => {
    if (l.applies_to !== "all" && l.applies_to !== service) return 0;
    const q = Number(l.quantity) || 0;
    if (l.inventory_item_id) {
      const it = itemById.get(l.inventory_item_id);
      if (!it || !l.unit) return 0;
      return ((q * FACTOR[l.unit]) / FACTOR[it.unit]) * it.avg_cost;
    }
    const s = l.sub_recipe_id ? subById.get(l.sub_recipe_id) : undefined;
    return s ? q * (service === "dine_in" ? s.dine_in_cost : s.takeout_cost) : 0;
  };
  const y = Number(yieldServings) || 1;
  const dine = lines.reduce((s, l) => s + lineCost(l, "dine_in"), 0) / y;
  const take = lines.reduce((s, l) => s + lineCost(l, "takeout"), 0) / y;

  const update = (key: string, patch: Partial<BuilderLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const save = () =>
    start(async () => {
      setError(null);
      const res = await saveRecipe({
        id: recipe.id,
        name,
        product_id: recipe.product_id,
        yield_servings: y,
        notes,
        lines: lines.map((l) => ({
          inventory_item_id: l.inventory_item_id,
          sub_recipe_id: l.sub_recipe_id,
          quantity: Number(l.quantity),
          unit: l.inventory_item_id ? l.unit : null,
          cost_type: l.cost_type,
          applies_to: l.applies_to,
        })),
      });
      if (!res.ok) return setError(res.error);
      toast.success("Recipe saved and costs updated.");
      if (!recipe.id) router.replace(`/admin/recipes/${res.data.id}`);
      else router.refresh();
    });

  return (
    <Card>
      <CardBody className="space-y-4">
        {error ? <Alert tone="error">{error}</Alert> : null}
        <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
          <Field label="Recipe name" htmlFor="r-name"><Input id="r-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></Field>
          <Field label="Batch yield (servings)" htmlFor="r-yield" hint="Quantities below are for the whole batch."><Input id="r-yield" type="number" min={0.001} step="any" value={yieldServings} onChange={(e) => setYield(e.target.value)} /></Field>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-xs font-bold uppercase text-wood-600">
                <th className="pb-2">Ingredient / sub-recipe</th><th className="pb-2">Qty</th><th className="pb-2">Unit</th><th className="pb-2">Cost type</th><th className="pb-2">Used for</th><th className="pb-2 text-right">Dine-in cost</th><th />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const it = l.inventory_item_id ? itemById.get(l.inventory_item_id) : undefined;
                return (
                  <tr key={l.key} className="border-t border-bamboo-300/40 align-top">
                    <td className="py-2 pr-2">
                      <Select
                        aria-label="Ingredient"
                        value={l.inventory_item_id ? `i:${l.inventory_item_id}` : l.sub_recipe_id ? `r:${l.sub_recipe_id}` : ""}
                        onChange={(e) => {
                          const [kind, id] = e.target.value.split(":");
                          if (kind === "i") update(l.key, { inventory_item_id: id, sub_recipe_id: null, unit: itemById.get(id)?.unit ?? null });
                          else update(l.key, { sub_recipe_id: id, inventory_item_id: null, unit: null });
                        }}
                        className="h-10"
                      >
                        <option value="" disabled>Choose…</option>
                        <optgroup label="Sub-recipes">
                          {subRecipes.map((s) => <option key={s.id} value={`r:${s.id}`}>{s.name}</option>)}
                        </optgroup>
                        <optgroup label="Inventory items">
                          {items.filter((i) => !i.is_archived || i.id === l.inventory_item_id).map((i) => <option key={i.id} value={`i:${i.id}`}>{i.name} ({i.sku})</option>)}
                        </optgroup>
                      </Select>
                    </td>
                    <td className="py-2 pr-2"><Input aria-label="Quantity" type="number" min={0} step="any" value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} className="h-10 w-24" /></td>
                    <td className="py-2 pr-2">
                      {it ? (
                        <Select aria-label="Unit" value={l.unit ?? it.unit} onChange={(e) => update(l.key, { unit: e.target.value as StockUnit })} className="h-10 w-24">
                          {compatible(it.unit).map((u) => <option key={u} value={u}>{u}</option>)}
                        </Select>
                      ) : <span className="inline-block pt-2.5 text-ink-muted">serving</span>}
                    </td>
                    <td className="py-2 pr-2">
                      <Select aria-label="Cost type" value={l.cost_type} onChange={(e) => update(l.key, { cost_type: e.target.value as CostType })} className="h-10">
                        {COST_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </Select>
                    </td>
                    <td className="py-2 pr-2">
                      <Select aria-label="Applies to" value={l.applies_to} onChange={(e) => update(l.key, { applies_to: e.target.value as BuilderLine["applies_to"] })} className="h-10">
                        <option value="all">All orders</option><option value="dine_in">Dine-in only</option><option value="takeout">Takeout only</option>
                      </Select>
                    </td>
                    <td className="py-2 pt-4 text-right tabular-nums">{peso(lineCost(l, "dine_in") / y)}</td>
                    <td className="py-2 pl-1"><Button variant="ghost" size="icon" aria-label="Remove line" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><Trash2 /></Button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { key: crypto.randomUUID(), inventory_item_id: null, sub_recipe_id: null, quantity: "1", unit: null, cost_type: "ingredient", applies_to: "all" }])}>
          <Plus /> Add line
        </Button>

        <div className="grid gap-3 rounded-xl bg-cream-200/60 p-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase text-ink-muted">Est. cost per serving</p>
            <p className="font-display text-2xl font-bold text-wood-800">Dine-in {peso(dine)} · Takeout {peso(take)}</p>
          </div>
          {price != null ? (
            <div>
              <p className="text-xs font-bold uppercase text-ink-muted">Gross profit per serving (dine-in)</p>
              <p className="font-display text-2xl font-bold text-wood-800">{peso(price - dine)} · {price > 0 ? percent(((price - dine) / price) * 100) : "—"}</p>
            </div>
          ) : null}
        </div>

        <Field label="Notes" htmlFor="r-notes"><Textarea id="r-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} className="min-h-16" /></Field>

        <div className="flex flex-wrap justify-between gap-2">
          <Button onClick={save} disabled={busy || !name.trim()}>{busy ? <Loader2 className="animate-spin" /> : null} Save recipe</Button>
          {recipe.id ? (
            <Button variant="ghost" className="text-terracotta-600" disabled={busy} onClick={() => start(async () => {
              if (!confirm("Delete this recipe? Stock will no longer be deducted for it.")) return;
              const res = await deleteRecipe(recipe.id!);
              if (!res.ok) return setError(res.error);
              router.replace("/admin/recipes");
            })}><Trash2 /> Delete recipe</Button>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}
