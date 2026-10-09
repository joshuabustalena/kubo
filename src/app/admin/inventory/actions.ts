"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminClient, bool, notAdmin, text } from "@/lib/admin";
import { ok, toFailure, type ActionResult } from "@/lib/errors";

export type FormState = { error?: string; saved?: boolean; id?: string };

const itemSchema = z.object({
  sku: z.string().trim().min(1, "SKU is required.").max(40).regex(/^[A-Za-z0-9-_.]+$/, "SKU: letters, numbers, - _ . only."),
  name: z.string().trim().min(1, "Name is required.").max(120),
  category: z.string().trim().max(40),
  unit: z.enum(["kg", "g", "l", "ml", "pc", "pack", "bottle"]),
  min_stock: z.number().min(0).max(1_000_000),
  supplier_id: z.uuid().nullable(),
  expiration_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  notes: z.string().max(500),
  is_archived: z.boolean(),
});

export async function saveItem(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await adminClient();
  if (!ctx) return { error: notAdmin.error };
  const id = text(form, "id");
  const parsed = itemSchema.safeParse({
    sku: text(form, "sku").toUpperCase(),
    name: text(form, "name"),
    category: text(form, "category") || "ingredient",
    unit: text(form, "unit"),
    min_stock: Number(text(form, "min_stock") || 0),
    supplier_id: text(form, "supplier_id") || null,
    expiration_date: text(form, "expiration_date") || null,
    notes: text(form, "notes"),
    is_archived: bool(form, "is_archived"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { supabase } = ctx;
  if (id) {
    const { error } = await supabase.from("inventory_items").update(parsed.data).eq("id", id);
    if (error) return { error: toFailure(error).error };
  } else {
    const { data, error } = await supabase.from("inventory_items").insert(parsed.data).select("id").single();
    if (error) return { error: toFailure(error).error };
    // Optional opening stock with cost
    const qty = Number(text(form, "opening_qty") || 0);
    const cost = Number(text(form, "opening_cost") || 0);
    if (qty > 0) {
      const { error: e2 } = await supabase.rpc("record_stock_adjustment", { p_item_id: data.id, p_type: "opening", p_quantity: qty, p_unit_cost: cost, p_notes: "Opening stock" });
      if (e2) return { error: toFailure(e2).error, id: data.id };
    }
    revalidatePath("/admin/inventory", "layout");
    return { saved: true, id: data.id };
  }
  revalidatePath("/admin/inventory", "layout");
  return { saved: true, id };
}

const adjustSchema = z.object({
  item_id: z.uuid(),
  type: z.enum(["opening", "adjustment", "spoilage", "count"]),
  quantity: z.number().finite(),
  unit_cost: z.number().min(0).nullable(),
  notes: z.string().max(300),
});

export async function recordAdjustment(raw: z.input<typeof adjustSchema>): Promise<ActionResult> {
  const ctx = await adminClient();
  if (!ctx) return notAdmin;
  const parsed = adjustSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const v = parsed.data;
  const { error } = await ctx.supabase.rpc("record_stock_adjustment", {
    p_item_id: v.item_id, p_type: v.type, p_quantity: v.quantity, p_unit_cost: v.unit_cost, p_notes: v.notes,
  });
  if (error) return toFailure(error);
  revalidatePath("/admin/inventory", "layout");
  return ok(undefined);
}

const poSchema = z.object({
  supplier_id: z.uuid().nullable(),
  order_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(500),
  receive_now: z.boolean(),
  items: z.array(z.object({
    inventory_item_id: z.uuid(),
    quantity: z.number().positive(),
    unit: z.enum(["kg", "g", "l", "ml", "pc", "pack", "bottle"]),
    unit_cost: z.number().min(0),
    expiration_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  })).min(1, "Add at least one item.").max(80),
});

export async function createPurchase(raw: z.input<typeof poSchema>): Promise<ActionResult<{ id: string }>> {
  const ctx = await adminClient();
  if (!ctx) return notAdmin;
  const parsed = poSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const v = parsed.data;
  const { data, error } = await ctx.supabase.rpc("create_purchase_order", {
    p_supplier_id: v.supplier_id, p_order_date: v.order_date, p_notes: v.notes, p_items: v.items, p_receive_now: v.receive_now,
  });
  if (error) return toFailure(error);
  revalidatePath("/admin/purchases");
  revalidatePath("/admin/inventory", "layout");
  return ok({ id: data as string });
}

export async function receivePurchase(id: string): Promise<ActionResult> {
  const ctx = await adminClient();
  if (!ctx) return notAdmin;
  const { error } = await ctx.supabase.rpc("receive_purchase_order", { p_po_id: id });
  if (error) return toFailure(error);
  revalidatePath("/admin/purchases", "layout");
  revalidatePath("/admin/inventory", "layout");
  return ok(undefined);
}

export async function cancelPurchase(id: string, reason: string): Promise<ActionResult> {
  const ctx = await adminClient();
  if (!ctx) return notAdmin;
  const { error } = await ctx.supabase.rpc("cancel_purchase_order", { p_po_id: id, p_reason: reason.slice(0, 200) });
  if (error) return toFailure(error);
  revalidatePath("/admin/purchases", "layout");
  return ok(undefined);
}

const supplierSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  contact_person: z.string().max(120),
  phone: z.string().max(40),
  email: z.union([z.literal(""), z.email("Invalid email.")]),
  address: z.string().max(300),
  notes: z.string().max(500),
  is_active: z.boolean(),
});

export async function saveSupplier(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await adminClient();
  if (!ctx) return { error: notAdmin.error };
  const id = text(form, "id");
  const parsed = supplierSchema.safeParse({
    name: text(form, "name"), contact_person: text(form, "contact_person"), phone: text(form, "phone"),
    email: text(form, "email"), address: text(form, "address"), notes: text(form, "notes"), is_active: bool(form, "is_active"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const q = id ? ctx.supabase.from("suppliers").update(parsed.data).eq("id", id) : ctx.supabase.from("suppliers").insert(parsed.data);
  const { error } = await q;
  if (error) return { error: toFailure(error).error };
  revalidatePath("/admin/suppliers");
  return { saved: true };
}

const expenseSchema = z.object({
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."),
  category: z.enum(["labor", "rent", "utilities", "supplies", "maintenance", "marketing", "transport", "other"]),
  description: z.string().trim().min(1, "Describe the expense.").max(200),
  amount: z.number().positive("Amount must be more than zero.").max(10_000_000),
});

export async function saveExpense(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await adminClient();
  if (!ctx) return { error: notAdmin.error };
  const id = text(form, "id");
  const parsed = expenseSchema.safeParse({
    expense_date: text(form, "expense_date"), category: text(form, "category"), description: text(form, "description"), amount: Number(text(form, "amount")),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const q = id
    ? ctx.supabase.from("operating_expenses").update(parsed.data).eq("id", id)
    : ctx.supabase.from("operating_expenses").insert({ ...parsed.data, created_by: ctx.user.id });
  const { error } = await q;
  if (error) return { error: toFailure(error).error };
  revalidatePath("/admin/expenses");
  revalidatePath("/admin");
  return { saved: true };
}

export async function deleteExpense(id: string): Promise<ActionResult> {
  const ctx = await adminClient();
  if (!ctx) return notAdmin;
  const { error } = await ctx.supabase.from("operating_expenses").delete().eq("id", id);
  if (error) return toFailure(error);
  revalidatePath("/admin/expenses");
  return ok(undefined);
}
