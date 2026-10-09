"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { num, UNIT_LABEL } from "@/lib/format";
import type { StockUnit } from "@/lib/types";
import { recordAdjustment } from "../actions";

const TYPES = {
  spoilage: { label: "Spoilage / waste", help: "Amount thrown away. Reduces stock and is reported as waste." },
  count: { label: "Physical count", help: "What you actually counted. The difference is logged." },
  adjustment: { label: "Correction (+/−)", help: "Add or remove stock, e.g. a data-entry fix. Use a negative number to remove." },
  opening: { label: "Opening stock", help: "Stock that was already on hand, with its cost per unit." },
} as const;

export function AdjustForm({ itemId, unit, current }: { itemId: string; unit: StockUnit; current: number }) {
  const [type, setType] = useState<keyof typeof TYPES>("spoilage");
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const q = Number(qty);
  const preview = type === "spoilage" ? current - Math.abs(q) : type === "count" ? q : type === "opening" ? current + Math.abs(q) : current + q;

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          const res = await recordAdjustment({ item_id: itemId, type, quantity: q, unit_cost: type === "opening" ? Number(cost) : null, notes });
          if (!res.ok) return setError(res.error);
          toast.success("Stock updated.");
          setQty(""); setNotes(""); setCost("");
          router.refresh();
        });
      }}
    >
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Field label="Type" htmlFor="adj-type" hint={TYPES[type].help}>
        <Select id="adj-type" value={type} onChange={(e) => setType(e.target.value as keyof typeof TYPES)}>
          {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={`Quantity (${UNIT_LABEL[unit]})`} htmlFor="adj-qty"><Input id="adj-qty" type="number" step="any" value={qty} onChange={(e) => setQty(e.target.value)} required /></Field>
        {type === "opening" ? <Field label={`Cost per ${UNIT_LABEL[unit]} (₱)`} htmlFor="adj-cost"><Input id="adj-cost" type="number" min={0} step="any" value={cost} onChange={(e) => setCost(e.target.value)} required /></Field> : null}
      </div>
      <Field label="Reason / notes" htmlFor="adj-notes"><Textarea id="adj-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} className="min-h-14" required={type !== "opening"} /></Field>
      {qty ? <p className="text-sm text-ink-muted">New balance: <b>{num(preview, 3)} {UNIT_LABEL[unit]}</b></p> : null}
      <Button type="submit" disabled={busy || !qty}>Record</Button>
    </form>
  );
}
