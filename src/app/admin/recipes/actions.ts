"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminClient, notAdmin } from "@/lib/admin";
import { ok, toFailure, type ActionResult } from "@/lib/errors";

const line = z.object({
  inventory_item_id: z.uuid().nullable(),
  sub_recipe_id: z.uuid().nullable(),
  quantity: z.number().positive("Quantities must be greater than zero.").max(100000),
  unit: z.enum(["kg", "g", "l", "ml", "pc", "pack", "bottle"]).nullable(),
  cost_type: z.enum(["ingredient", "oil_seasoning", "gravy", "drink", "packaging", "consumable"]),
  applies_to: z.enum(["all", "dine_in", "takeout"]),
}).refine((l) => (l.inventory_item_id ? 1 : 0) + (l.sub_recipe_id ? 1 : 0) === 1, "Each line needs an ingredient or a sub-recipe.");

const recipe = z.object({
  id: z.uuid().nullable(),
  name: z.string().trim().min(1, "Name the recipe.").max(120),
  product_id: z.uuid().nullable(),
  yield_servings: z.number().positive("Yield must be at least 1 serving.").max(10000),
  notes: z.string().max(1000),
  lines: z.array(line).max(60),
});

export async function saveRecipe(raw: z.input<typeof recipe>): Promise<ActionResult<{ id: string }>> {
  const ctx = await adminClient();
  if (!ctx) return notAdmin;
  const parsed = recipe.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const v = parsed.data;
  const { data, error } = await ctx.supabase.rpc("save_recipe", {
    p_recipe_id: v.id,
    p_name: v.name,
    p_product_id: v.product_id,
    p_yield: v.yield_servings,
    p_notes: v.notes,
    p_lines: v.lines,
  });
  if (error) return toFailure(error);
  revalidatePath("/admin/recipes", "layout");
  revalidatePath("/admin/menu");
  return ok({ id: data as string });
}

export async function deleteRecipe(id: string): Promise<ActionResult> {
  const ctx = await adminClient();
  if (!ctx) return notAdmin;
  const { error } = await ctx.supabase.from("recipes").delete().eq("id", id);
  if (error) return toFailure(error);
  revalidatePath("/admin/recipes", "layout");
  return ok(undefined);
}
