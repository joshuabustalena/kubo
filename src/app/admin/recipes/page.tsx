import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { peso, percent } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Recipes & costing" };

type Costing = {
  product_id: string; product_name: string; category_name: string; price: number; has_recipe: boolean;
  dine_in_cost: number; takeout_cost: number; dine_in_profit: number; dine_in_margin: number; takeout_profit: number; takeout_margin: number; is_archived: boolean;
};

export default async function RecipesPage() {
  const supabase = await createClient();
  const [{ data: costing }, { data: recipes }] = await Promise.all([
    supabase.rpc("product_costing"),
    supabase.rpc("admin_recipe_costs"),
  ]);
  const rows = ((costing ?? []) as Costing[]).filter((r) => !r.is_archived);
  const recipeByProduct = new Map((recipes ?? []).filter((r: { product_id: string | null }) => r.product_id).map((r: { product_id: string; recipe_id: string }) => [r.product_id, r.recipe_id]));
  const subRecipes = (recipes ?? []).filter((r: { product_id: string | null }) => !r.product_id) as { recipe_id: string; name: string; yield_servings: number; dine_in_cost: number; takeout_cost: number }[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recipes & food costing"
        description="Cost per serving = Σ ingredient quantity × weighted-average purchase cost, including oil, seasoning, gravy, the free drink and packaging. Takeout adds takeout-only lines (container, utensils, bag)."
        actions={<ButtonLink href="/admin/recipes/new"><Plus /> New sub-recipe</ButtonLink>}
      />
      <Card>
        <CardHeader title="Menu item costing" description="Gross profit per serving = selling price − estimated direct cost. Margin = gross profit ÷ price × 100." />
        <Table>
          <thead>
            <tr>
              <Th>Item</Th><Th className="text-right">Price</Th><Th className="text-right">Dine-in cost</Th><Th className="text-right">Dine-in profit</Th><Th className="text-right">Margin</Th>
              <Th className="text-right">Takeout cost</Th><Th className="text-right">Takeout margin</Th><Th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Tr key={r.product_id}>
                <Td><span className="font-semibold">{r.product_name}</span><br /><span className="text-xs text-ink-muted">{r.category_name}</span></Td>
                <Td className="text-right tabular-nums">{peso(r.price)}</Td>
                {r.has_recipe ? (
                  <>
                    <Td className="text-right tabular-nums">{peso(r.dine_in_cost)}</Td>
                    <Td className="text-right tabular-nums">{peso(r.dine_in_profit)}</Td>
                    <Td className="text-right"><Badge tone={Number(r.dine_in_margin) < 25 ? "red" : Number(r.dine_in_margin) < 40 ? "gold" : "green"}>{percent(r.dine_in_margin)}</Badge></Td>
                    <Td className="text-right tabular-nums">{peso(r.takeout_cost)}</Td>
                    <Td className="text-right tabular-nums">{percent(r.takeout_margin)}</Td>
                  </>
                ) : (
                  <Td colSpan={5} className="text-terracotta-600">No recipe yet — stock won&apos;t be deducted and cost is unknown.</Td>
                )}
                <Td className="text-right">
                  <Link className="font-semibold text-forest-700 hover:underline" href={recipeByProduct.get(r.product_id) ? `/admin/recipes/${recipeByProduct.get(r.product_id)}` : `/admin/recipes/new?product=${r.product_id}`}>
                    {recipeByProduct.get(r.product_id) ? "Edit recipe" : "Create recipe"}
                  </Link>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        <CardBody className="text-xs text-ink-muted">Margin badges: red under 25%, gold 25–40%, green above 40%. Takeout packaging fees charged to the customer are reported separately in sales.</CardBody>
      </Card>

      <Card>
        <CardHeader title="Sub-recipes" description="Reusable building blocks such as Java Rice, the free iced tea, gravy and the takeout kit." />
        <Table>
          <thead><tr><Th>Sub-recipe</Th><Th className="text-right">Batch yield</Th><Th className="text-right">Cost / serving</Th><Th /></tr></thead>
          <tbody>
            {subRecipes.map((r) => (
              <Tr key={r.recipe_id}>
                <Td className="font-semibold">{r.name}</Td>
                <Td className="text-right">{Number(r.yield_servings)} servings</Td>
                <Td className="text-right tabular-nums">{peso(r.dine_in_cost)}</Td>
                <Td className="text-right"><Link className="font-semibold text-forest-700 hover:underline" href={`/admin/recipes/${r.recipe_id}`}>Edit</Link></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
