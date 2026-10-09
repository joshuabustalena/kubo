"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { useToast } from "@/components/ui/toast";
import type { Category } from "@/lib/types";
import { deleteCategory, saveCategory, type FormState } from "../actions";

type Row = Category & { count: number };

export function CategoryEditor({ categories }: { categories: Row[] }) {
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const router = useRouter();
  const toast = useToast();
  return (
    <>
      <div className="mb-4"><Button onClick={() => setEditing("new")}><Plus /> New category</Button></div>
      <Card className="divide-y divide-bamboo-300/40">
        {categories.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <p className="font-semibold">{c.sort_order}. {c.name} {!c.is_active ? <Badge>Hidden</Badge> : null} {c.is_addon_category ? <Badge tone="blue">Add-ons</Badge> : null}</p>
              <p className="text-sm text-ink-muted">{c.count} items · /{c.slug}</p>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => setEditing(c)}><Pencil /> Edit</Button>
              <Button size="sm" variant="ghost" aria-label={`Delete ${c.name}`} onClick={async () => {
                if (!confirm(`Delete ${c.name}?`)) return;
                const res = await deleteCategory(c.id);
                if (res.ok) { toast.success("Category deleted."); router.refresh(); } else toast.error(res.error);
              }}><Trash2 /></Button>
            </div>
          </div>
        ))}
      </Card>
      {editing ? <CategoryDialog category={editing === "new" ? null : editing} onClose={() => { setEditing(null); router.refresh(); }} /> : null}
    </>
  );
}

function CategoryDialog({ category, onClose }: { category: Category | null; onClose: () => void }) {
  const [state, action] = useActionState<FormState, FormData>(saveCategory, {});
  useEffect(() => { if (state.saved) onClose(); }, [state.saved, onClose]);
  return (
    <Dialog open onClose={onClose} title={category ? `Edit ${category.name}` : "New category"}>
      <form action={action} className="space-y-3">
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}
        <input type="hidden" name="id" value={category?.id ?? ""} />
        <Field label="Name" htmlFor="c-name"><Input id="c-name" name="name" defaultValue={category?.name} required maxLength={80} /></Field>
        <Field label="Slug (optional)" htmlFor="c-slug" hint="Leave blank to generate from the name."><Input id="c-slug" name="slug" defaultValue={category?.slug} maxLength={60} /></Field>
        <Field label="Description" htmlFor="c-desc"><Textarea id="c-desc" name="description" defaultValue={category?.description} maxLength={300} className="min-h-16" /></Field>
        <Field label="Sort order" htmlFor="c-sort"><Input id="c-sort" name="sort_order" type="number" min={0} defaultValue={category?.sort_order ?? 0} /></Field>
        <Checkbox name="is_active" label="Visible on the menu" defaultChecked={category?.is_active ?? true} />
        <Checkbox name="is_addon_category" label="Drinks & add-ons section" defaultChecked={category?.is_addon_category ?? false} />
        <div className="flex justify-end gap-2 pt-2"><Button variant="outline" onClick={onClose}>Cancel</Button><SubmitButton pendingText="Saving…">Save</SubmitButton></div>
      </form>
    </Dialog>
  );
}
