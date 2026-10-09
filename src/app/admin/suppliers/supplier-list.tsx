"use client";

import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { peso } from "@/lib/format";
import type { Supplier } from "@/lib/types";
import { saveSupplier, type FormState } from "../inventory/actions";

type Row = Supplier & { spend: number; items: number };

export function SupplierList({ suppliers }: { suppliers: Row[] }) {
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const router = useRouter();
  return (
    <>
      <div className="mb-4"><Button onClick={() => setEditing("new")}><Plus /> New supplier</Button></div>
      <Card>
        <Table>
          <thead><tr><Th>Supplier</Th><Th>Contact</Th><Th className="text-right">Items supplied</Th><Th className="text-right">Total received</Th><Th /></tr></thead>
          <tbody>
            {suppliers.map((s) => (
              <Tr key={s.id}>
                <Td><span className="font-semibold">{s.name}</span> {!s.is_active ? <Badge>Inactive</Badge> : null}<br /><span className="text-xs text-ink-muted">{s.notes}</span></Td>
                <Td className="text-sm">{s.contact_person}<br /><span className="text-ink-muted">{[s.phone, s.email].filter(Boolean).join(" · ")}</span></Td>
                <Td className="text-right">{s.items}</Td>
                <Td className="text-right tabular-nums">{peso(s.spend)}</Td>
                <Td className="text-right"><Button size="sm" variant="outline" onClick={() => setEditing(s)}><Pencil /> Edit</Button></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
      {editing ? <SupplierDialog supplier={editing === "new" ? null : editing} onClose={() => { setEditing(null); router.refresh(); }} /> : null}
    </>
  );
}

function SupplierDialog({ supplier, onClose }: { supplier: Supplier | null; onClose: () => void }) {
  const [state, action] = useActionState<FormState, FormData>(saveSupplier, {});
  useEffect(() => { if (state.saved) onClose(); }, [state.saved, onClose]);
  return (
    <Dialog open onClose={onClose} title={supplier ? `Edit ${supplier.name}` : "New supplier"}>
      <form action={action} className="space-y-3">
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}
        <input type="hidden" name="id" value={supplier?.id ?? ""} />
        <Field label="Name" htmlFor="s-name"><Input id="s-name" name="name" defaultValue={supplier?.name} required maxLength={120} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Contact person" htmlFor="s-contact"><Input id="s-contact" name="contact_person" defaultValue={supplier?.contact_person} maxLength={120} /></Field>
          <Field label="Phone" htmlFor="s-phone"><Input id="s-phone" name="phone" defaultValue={supplier?.phone} maxLength={40} /></Field>
        </div>
        <Field label="Email" htmlFor="s-email"><Input id="s-email" name="email" type="email" defaultValue={supplier?.email} /></Field>
        <Field label="Address" htmlFor="s-address"><Input id="s-address" name="address" defaultValue={supplier?.address} maxLength={300} /></Field>
        <Field label="Notes" htmlFor="s-notes"><Textarea id="s-notes" name="notes" defaultValue={supplier?.notes} maxLength={500} className="min-h-14" /></Field>
        <Checkbox name="is_active" label="Active" defaultChecked={supplier?.is_active ?? true} />
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><SubmitButton pendingText="Saving…">Save</SubmitButton></div>
      </form>
    </Dialog>
  );
}
