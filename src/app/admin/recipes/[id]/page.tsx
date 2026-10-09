import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { COST_TYPES } from "@/lib/types";
import { dateTime, num, peso, UNIT_LABEL } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { RecipeBuilder, type BuilderLine } from "./recipe-builder";

export default async function RecipePage(props: PageProps<"/admin/recipes/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const isNew = id === "new";
  const productId = isNew && typeof sp.product === "string" ? sp.product : null;
  const supabase = await createClient();

  const [{ data: recipe }, { data: lines }, { data: items }, { data: allRecipes }, { data: product }] = await Promise.all([
    isNew ? Promise.resolve({ data: null }) : supabase.from("recipes").select("*").eq("id", id).maybeSingle(),
    isNew ? Promise.resolve({ data: [] }) : supabase.from("recipe_ingredients").select("*").eq("recipe_id", id).order("sort_order"),
    supabase.from("inventory_items").select("id, name, sku, unit, avg_cost, is_archived").order("name"),
    supabase.rpc("admin_recipe_costs"),
    productId ? supabase.from("products").select("id, name, price").eq("id", productId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!isNew && !recipe) notFound();

  const linkedProductId = (recipe?.product_id as string | null) ?? productId;
  const [{ data: linked }, breakdownDine, breakdownTake, history] = await Promise.all([
    linkedProductId && !product ? supabase.from("products").select("id, name, price").eq("id", linkedProductId).maybeSingle() : Promise.resolve({ data: product }),
    isNew ? Promise.resolve({ data: [] }) : supabase.rpc("recipe_cost_breakdown", { p_recipe_id: id, p_service: "dine_in" }),
    isNew ? Promise.resolve({ data: [] }) : supabase.rpc("recipe_cost_breakdown", { p_recipe_id: id, p_service: "takeout" }),
    linkedProductId ? supabase.from("product_cost_history").select("*").eq("product_id", linkedProductId).order("recorded_at", { ascending: false }).limit(12) : Promise.resolve({ data: [] }),
  ]);
  const linkedProduct = (linked ?? product) as { id: string; name: string; price: number } | null;

  const subRecipes = ((allRecipes ?? []) as { recipe_id: string; name: string; product_id: string | null; dine_in_cost: number; takeout_cost: number }[])
    .filter((r) => !r.product_id && r.recipe_id !== id);

  const initial: BuilderLine[] = ((lines ?? []) as Record<string, unknown>[]).map((l) => ({
    key: String(l.id),
    inventory_item_id: (l.inventory_item_id as string | null) ?? null,
    sub_recipe_id: (l.sub_recipe_id as string | null) ?? null,
    quantity: String(l.quantity),
    unit: (l.unit as BuilderLine["unit"]) ?? null,
    cost_type: l.cost_type as BuilderLine["cost_type"],
    applies_to: l.applies_to as BuilderLine["applies_to"],
  }));
  const label = (t: string) => COST_TYPES.find((c) => c.value === t)?.label ?? t;

  return (
    <div className="space-y-6">
      <Link href="/admin/recipes" className="inline-flex items-center gap-1.5 text-sm font-semibold text-forest-700 hover:underline"><ArrowLeft className="size-4" /> Recipes &amp; costing</Link>
      <PageHeader
        title={isNew ? (linkedProduct ? `Recipe for ${linkedProduct.name}` : "New sub-recipe") : String(recipe!.name)}
        description={linkedProduct ? `Selling price ${peso(linkedProduct.price)}. Saving updates the cost history; past orders keep their cost snapshot.` : "Sub-recipes can be used inside meal recipes."}
      />
      <RecipeBuilder
        recipe={recipe ? { id: String(recipe.id), name: String(recipe.name), yield_servings: Number(recipe.yield_servings), notes: String(recipe.notes ?? ""), product_id: linkedProductId } : { id: null, name: linkedProduct?.name ?? "", yield_servings: 1, notes: "", product_id: linkedProductId }}
        price={linkedProduct ? Number(linkedProduct.price) : null}
        initialLines={initial}
        items={(items ?? []).map((i) => ({ ...i, avg_cost: Number(i.avg_cost) }))}
        subRecipes={subRecipes.map((r) => ({ id: r.recipe_id, name: r.name, dine_in_cost: Number(r.dine_in_cost), takeout_cost: Number(r.takeout_cost) }))}
      />

      {!isNew ? (
        <div className="grid gap-6 xl:grid-cols-2">
          {[{ title: "Dine-in ingredient usage", rows: breakdownDine.data ?? [] }, { title: "Takeout ingredient usage", rows: breakdownTake.data ?? [] }].map((b) => (
            <Card key={b.title}>
              <CardHeader title={b.title} description="Per serving, sub-recipes expanded, at current average cost" />
              <Table>
                <thead><tr><Th>Ingredient</Th><Th>Type</Th><Th className="text-right">Qty</Th><Th className="text-right">Cost</Th></tr></thead>
                <tbody>
                  {(b.rows as { inventory_item_id: string; item_name: string; unit: string; cost_type: string; quantity: number; cost: number }[]).map((r) => (
                    <Tr key={r.inventory_item_id + r.cost_type}>
                      <Td>{r.item_name}</Td><Td className="text-ink-muted">{label(r.cost_type)}</Td>
                      <Td className="text-right tabular-nums">{num(r.quantity, 4)} {UNIT_LABEL[r.unit]}</Td>
                      <Td className="text-right tabular-nums">{peso(r.cost)}</Td>
                    </Tr>
                  ))}
                  <Tr><Td className="font-bold" colSpan={3}>Total per serving</Td><Td className="text-right font-bold tabular-nums">{peso((b.rows as { cost: number }[]).reduce((s, r) => s + Number(r.cost), 0))}</Td></Tr>
                </tbody>
              </Table>
            </Card>
          ))}
        </div>
      ) : null}

      {(history.data ?? []).length > 0 ? (
        <Card>
          <CardHeader title="Cost changes over time" description="Recorded when purchases change average costs, recipes change or prices change." />
          <Table>
            <thead><tr><Th>When</Th><Th className="text-right">Price</Th><Th className="text-right">Dine-in cost</Th><Th className="text-right">Takeout cost</Th><Th className="text-right">Dine-in margin</Th></tr></thead>
            <tbody>
              {(history.data ?? []).map((h: { id: number; recorded_at: string; price: number; dine_in_cost: number; takeout_cost: number }) => (
                <Tr key={h.id}>
                  <Td>{dateTime(h.recorded_at)}</Td>
                  <Td className="text-right tabular-nums">{peso(h.price)}</Td>
                  <Td className="text-right tabular-nums">{peso(h.dine_in_cost)}</Td>
                  <Td className="text-right tabular-nums">{peso(h.takeout_cost)}</Td>
                  <Td className="text-right tabular-nums">{Number(h.price) > 0 ? `${num(((Number(h.price) - Number(h.dine_in_cost)) / Number(h.price)) * 100, 1)}%` : "—"}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}
    </div>
  );
}
