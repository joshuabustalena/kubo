"use client";

import { Pencil, Plus, Receipt, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { dateOnly, peso } from "@/lib/format";
import { deleteExpense, saveExpense, type FormState } from "../inventory/actions";

type Expense = { id: string; expense_date: string; category: string; description: string; amount: number };
const CATS = { labor: "Labor", rent: "Rent", utilities: "Utilities", supplies: "Supplies", maintenance: "Maintenance", marketing: "Marketing", transport: "Transport", other: "Other" };

export function ExpenseManager({ rows, today }: { rows: Expense[]; today: string }) {
  const [editing, setEditing] = useState<Expense | "new" | null>(null);
  const router = useRouter();
  const toast = useToast();
  return (
    <>
      <div><Button onClick={() => setEditing("new")}><Plus /> Add expense</Button></div>
      <Card>
        {rows.length === 0 ? <EmptyState icon={<Receipt />} title="No expenses in this range" /> : (
          <Table>
            <thead><tr><Th>Date</Th><Th>Category</Th><Th>Description</Th><Th className="text-right">Amount</Th><Th /></tr></thead>
            <tbody>
              {rows.map((e) => (
                <Tr key={e.id}>
                  <Td>{dateOnly(e.expense_date)}</Td>
                  <Td><Badge>{CATS[e.category as keyof typeof CATS]}</Badge></Td>
                  <Td>{e.description}</Td>
                  <Td className="text-right tabular-nums">{peso(e.amount)}</Td>
                  <Td className="whitespace-nowrap text-right">
                    <Button size="icon" variant="ghost" aria-label="Edit" onClick={() => setEditing(e)}><Pencil /></Button>
                    <Button size="icon" variant="ghost" aria-label="Delete" onClick={async () => {
                      if (!confirm("Delete this expense?")) return;
                      const res = await deleteExpense(e.id);
                      if (res.ok) { toast.success("Deleted (logged in the audit trail)."); router.refresh(); } else toast.error(res.error);
                    }}><Trash2 /></Button>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {editing ? <ExpenseDialog expense={editing === "new" ? null : editing} today={today} onClose={() => { setEditing(null); router.refresh(); }} /> : null}
    </>
  );
}

function ExpenseDialog({ expense, today, onClose }: { expense: Expense | null; today: string; onClose: () => void }) {
  const [state, action] = useActionState<FormState, FormData>(saveExpense, {});
  useEffect(() => { if (state.saved) onClose(); }, [state.saved, onClose]);
  return (
    <Dialog open onClose={onClose} title={expense ? "Edit expense" : "Add expense"}>
      <form action={action} className="space-y-3">
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}
        <input type="hidden" name="id" value={expense?.id ?? ""} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date" htmlFor="e-date"><Input id="e-date" name="expense_date" type="date" defaultValue={expense?.expense_date ?? today} required /></Field>
          <Field label="Category" htmlFor="e-cat">
            <Select id="e-cat" name="category" defaultValue={expense?.category ?? "labor"}>{Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
          </Field>
        </div>
        <Field label="Description" htmlFor="e-desc"><Input id="e-desc" name="description" defaultValue={expense?.description} required maxLength={200} placeholder="e.g. Weekly wages — 2 crew" /></Field>
        <Field label="Amount (₱)" htmlFor="e-amt"><Input id="e-amt" name="amount" type="number" min={0.01} step="0.01" defaultValue={expense?.amount} required /></Field>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><SubmitButton pendingText="Saving…">Save</SubmitButton></div>
      </form>
    </Dialog>
  );
}
