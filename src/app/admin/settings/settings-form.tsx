"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { PaymentMethod, StoreSettings } from "@/lib/types";
import { savePaymentMethod, saveSettings, type FormState } from "./actions";

export function SettingsForm({ settings: s }: { settings: StoreSettings }) {
  const [state, action] = useActionState<FormState, FormData>(saveSettings, {});
  const [hours, setHours] = useState(() => (s.opening_hours.length ? s.opening_hours : [{ days: "", hours: "" }]).map((h) => ({ ...h, key: crypto.randomUUID() })));
  return (
    <form action={action} className="space-y-6">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.saved ? <Alert tone="success">Settings saved.</Alert> : null}
      <Card>
        <CardHeader title="Store information" description="Shown on the website, receipts and the contact page." />
        <CardBody className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Store name" htmlFor="store_name"><Input id="store_name" name="store_name" defaultValue={s.store_name} required maxLength={80} /></Field>
            <Field label="Tagline" htmlFor="tagline"><Input id="tagline" name="tagline" defaultValue={s.tagline} maxLength={160} /></Field>
            <Field label="Address" htmlFor="address"><Input id="address" name="address" defaultValue={s.address} maxLength={200} /></Field>
            <Field label="Phone" htmlFor="phone"><Input id="phone" name="phone" defaultValue={s.phone} maxLength={40} /></Field>
            <Field label="Email" htmlFor="email"><Input id="email" name="email" type="email" defaultValue={s.email} /></Field>
            <Field label="Facebook page URL" htmlFor="facebook_url"><Input id="facebook_url" name="facebook_url" defaultValue={s.facebook_url} placeholder="https://facebook.com/…" /></Field>
            <Field label="Google Maps link" htmlFor="map_url" className="sm:col-span-2"><Input id="map_url" name="map_url" defaultValue={s.map_url} placeholder="https://maps.google.com/…" /></Field>
          </div>
          <Field label="About Kainan sa Kubo" htmlFor="about" hint="Blank lines start new paragraphs."><Textarea id="about" name="about" defaultValue={s.about} maxLength={3000} className="min-h-28" /></Field>
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-wood-700">Opening hours</legend>
            {hours.map((h) => (
              <div key={h.key} className="flex gap-2">
                <Input name="hours_days" defaultValue={h.days} placeholder="Monday – Friday" aria-label="Days" className="h-10" />
                <Input name="hours_hours" defaultValue={h.hours} placeholder="9:00 AM – 9:00 PM" aria-label="Hours" className="h-10" />
                <Button variant="ghost" size="icon" aria-label="Remove row" onClick={() => setHours((hs) => hs.filter((x) => x.key !== h.key))}><Trash2 /></Button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => setHours((hs) => [...hs, { days: "", hours: "", key: crypto.randomUUID() }])}><Plus /> Add row</Button>
          </fieldset>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Ordering" />
        <CardBody className="space-y-3">
          <Checkbox name="online_ordering_enabled" label="Accept online orders" defaultChecked={s.online_ordering_enabled} />
          <Field label="Takeout packaging fee per order (₱)" htmlFor="pkg" hint="Charged to customers on takeout. Packaging cost itself is tracked in recipes." className="max-w-xs">
            <Input id="pkg" name="takeout_packaging_fee" type="number" min={0} step="0.01" defaultValue={s.takeout_packaging_fee} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Inventory rules" />
        <CardBody className="space-y-3">
          <Field label="Deduct ingredients when an order is…" htmlFor="stage" className="max-w-sm">
            <Select id="stage" name="inventory_deduct_stage" defaultValue={s.inventory_deduct_stage}>
              <option value="completed">Completed (handed to the customer)</option>
              <option value="preparing">Being prepared (kitchen starts cooking)</option>
            </Select>
          </Field>
          <Checkbox name="restock_on_cancel" label="Return ingredients to stock when a prepared order is cancelled (untick to treat them as waste)" defaultChecked={s.restock_on_cancel} />
          <Checkbox name="block_orders_on_low_stock" label="Refuse orders when ingredients on hand are not enough" defaultChecked={s.block_orders_on_low_stock} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="POS rules" />
        <CardBody>
          <Field label="Maximum discount staff can give (%)" htmlFor="maxd" hint="Staff with the discount permission can go up to this; more needs an admin PIN." className="max-w-xs">
            <Input id="maxd" name="max_staff_discount_percent" type="number" min={0} max={100} step="0.5" defaultValue={s.max_staff_discount_percent} />
          </Field>
        </CardBody>
      </Card>
      <SubmitButton size="lg" pendingText="Saving…">Save settings</SubmitButton>
    </form>
  );
}

export function PaymentMethods({ methods }: { methods: PaymentMethod[] }) {
  const [editing, setEditing] = useState<PaymentMethod | "new" | null>(null);
  const router = useRouter();
  return (
    <Card>
      <CardHeader title="Payment methods" description="Digital payments are always verified by staff before they count as paid." action={<Button size="sm" onClick={() => setEditing("new")}><Plus /> Add method</Button>} />
      <ul className="divide-y divide-bamboo-300/40">
        {methods.map((m) => (
          <li key={m.code} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
            <div>
              <p className="font-semibold">{m.name} <span className="font-mono text-xs text-ink-muted">{m.code}</span></p>
              <div className="mt-1 flex flex-wrap gap-1">
                <Badge tone={m.is_active ? "green" : "neutral"}>{m.is_active ? "Active" : "Off"}</Badge>
                {m.allow_online ? <Badge>Online</Badge> : null}
                {m.allow_pos ? <Badge>POS</Badge> : null}
                {m.is_cash ? <Badge tone="gold">Cash</Badge> : null}
                {m.requires_reference ? <Badge tone="blue">Needs reference no.</Badge> : null}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => setEditing(m)}><Pencil /> Edit</Button>
          </li>
        ))}
      </ul>
      {editing ? <MethodDialog method={editing === "new" ? null : editing} onClose={() => { setEditing(null); router.refresh(); }} /> : null}
    </Card>
  );
}

function MethodDialog({ method, onClose }: { method: PaymentMethod | null; onClose: () => void }) {
  const [m, setM] = useState<PaymentMethod>(method ?? { code: "", name: "", instructions: "", is_active: true, allow_online: true, allow_pos: true, is_cash: false, requires_reference: true, sort_order: 10 });
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  return (
    <Dialog open onClose={onClose} title={method ? `Edit ${method.name}` : "New payment method"} footer={<>
      <Button variant="outline" onClick={onClose}>Cancel</Button>
      <Button disabled={busy} onClick={() => start(async () => {
        const res = await savePaymentMethod(m, !method);
        if (!res.ok) return setError(res.error);
        onClose();
      })}>Save</Button>
    </>}>
      {error ? <Alert tone="error" className="mb-3">{error}</Alert> : null}
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Code" htmlFor="pm-code"><Input id="pm-code" value={m.code} disabled={!!method} onChange={(e) => setM({ ...m, code: e.target.value.toLowerCase() })} placeholder="maya" /></Field>
          <Field label="Name" htmlFor="pm-name"><Input id="pm-name" value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} placeholder="Maya" /></Field>
        </div>
        <Field label="Instructions for customers" htmlFor="pm-ins"><Textarea id="pm-ins" value={m.instructions} onChange={(e) => setM({ ...m, instructions: e.target.value })} maxLength={400} className="min-h-16" /></Field>
        <div className="grid gap-2 sm:grid-cols-2">
          <Checkbox label="Active" checked={m.is_active} onChange={(e) => setM({ ...m, is_active: e.target.checked })} />
          <Checkbox label="Allowed online" checked={m.allow_online} onChange={(e) => setM({ ...m, allow_online: e.target.checked })} />
          <Checkbox label="Allowed at POS" checked={m.allow_pos} onChange={(e) => setM({ ...m, allow_pos: e.target.checked })} />
          <Checkbox label="Is cash (compute change)" checked={m.is_cash} onChange={(e) => setM({ ...m, is_cash: e.target.checked })} />
          <Checkbox label="Requires reference number" checked={m.requires_reference} onChange={(e) => setM({ ...m, requires_reference: e.target.checked })} />
        </div>
        <Field label="Order" htmlFor="pm-sort" className="max-w-32"><Input id="pm-sort" type="number" min={0} value={m.sort_order} onChange={(e) => setM({ ...m, sort_order: Number(e.target.value) })} /></Field>
      </div>
    </Dialog>
  );
}
