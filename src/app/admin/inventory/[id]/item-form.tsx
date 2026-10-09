"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { Alert } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { STOCK_UNITS, type InventoryItem, type Supplier } from "@/lib/types";
import { saveItem, type FormState } from "../actions";

export function ItemForm({ item, suppliers }: { item: InventoryItem | null; suppliers: Supplier[] }) {
  const [state, action] = useActionState<FormState, FormData>(saveItem, {});
  const router = useRouter();
  useEffect(() => {
    if (state.saved && !item && state.id) router.replace(`/admin/inventory/${state.id}`);
  }, [state, item, router]);

  return (
    <form action={action} className="space-y-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.saved && item ? <Alert tone="success">Saved.</Alert> : null}
      <input type="hidden" name="id" value={item?.id ?? ""} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" htmlFor="name"><Input id="name" name="name" defaultValue={item?.name} required maxLength={120} /></Field>
        <Field label="SKU / code" htmlFor="sku"><Input id="sku" name="sku" defaultValue={item?.sku} required maxLength={40} className="font-mono uppercase" /></Field>
        <Field label="Stock unit" htmlFor="unit" hint={item ? "Fixed once stock has moved." : "Recipes can use compatible units (g ↔ kg, ml ↔ L)."}>
          <Select id="unit" name="unit" defaultValue={item?.unit ?? "kg"}>{STOCK_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</Select>
        </Field>
        <Field label="Category" htmlFor="category"><Input id="category" name="category" defaultValue={item?.category ?? "ingredient"} maxLength={40} list="inv-cats" /></Field>
        <Field label="Minimum stock (alert level)" htmlFor="min_stock"><Input id="min_stock" name="min_stock" type="number" min={0} step="any" defaultValue={item?.min_stock ?? 0} /></Field>
        <Field label="Supplier" htmlFor="supplier_id">
          <Select id="supplier_id" name="supplier_id" defaultValue={item?.supplier_id ?? ""}>
            <option value="">—</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Expiration date (current batch)" htmlFor="expiration_date"><Input id="expiration_date" name="expiration_date" type="date" defaultValue={item?.expiration_date ?? ""} /></Field>
      </div>
      <datalist id="inv-cats">{["ingredient", "protein", "seasoning", "oil", "gravy", "drink", "packaging"].map((c) => <option key={c} value={c} />)}</datalist>
      {!item ? (
        <div className="grid gap-3 rounded-xl bg-cream-200/60 p-3 sm:grid-cols-2">
          <Field label="Opening stock (optional)" htmlFor="opening_qty"><Input id="opening_qty" name="opening_qty" type="number" min={0} step="any" /></Field>
          <Field label="Cost per stock unit (₱)" htmlFor="opening_cost"><Input id="opening_cost" name="opening_cost" type="number" min={0} step="any" /></Field>
        </div>
      ) : null}
      <Field label="Notes" htmlFor="notes"><Textarea id="notes" name="notes" defaultValue={item?.notes} maxLength={500} className="min-h-14" /></Field>
      {item ? <Checkbox name="is_archived" label="Archived (hidden from lists and recipe pickers)" defaultChecked={item.is_archived} /> : null}
      <SubmitButton pendingText="Saving…">{item ? "Save details" : "Create item"}</SubmitButton>
    </form>
  );
}
