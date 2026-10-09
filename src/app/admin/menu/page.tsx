import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ProductImage } from "@/components/brand/meal-art";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { peso, percent } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Category, Product } from "@/lib/types";
import { ProductToggles } from "./product-toggles";

export const metadata: Metadata = { title: "Menu items" };

export default async function AdminMenuPage(props: PageProps<"/admin/menu">) {
  const sp = await props.searchParams;
  const showArchived = sp.archived === "1";
  const supabase = await createClient();
  const [{ data: products }, { data: categories }, { data: costing }] = await Promise.all([
    supabase.from("products").select("*").eq("is_archived", showArchived).order("sort_order").order("name"),
    supabase.from("categories").select("*").order("sort_order"),
    supabase.rpc("product_costing"),
  ]);
  const cats = (categories ?? []) as Category[];
  const cost = new Map((costing ?? []).map((c: { product_id: string; dine_in_cost: number; dine_in_margin: number; has_recipe: boolean }) => [c.product_id, c]));

  return (
    <div>
      <PageHeader
        title="Menu items"
        description="Prices, availability and add-ons. Costs come from each item's recipe."
        actions={
          <>
            <ButtonLink href={showArchived ? "/admin/menu" : "/admin/menu?archived=1"} variant="outline" size="sm">{showArchived ? "Show active" : "Show archived"}</ButtonLink>
            <ButtonLink href="/admin/menu/new"><Plus /> New item</ButtonLink>
          </>
        }
      />
      {cats.map((c) => {
        const list = ((products ?? []) as Product[]).filter((p) => p.category_id === c.id);
        if (!list.length) return null;
        return (
          <Card key={c.id} className="mb-5 overflow-hidden">
            <div className="flex items-center justify-between border-b border-bamboo-300/40 px-5 py-3">
              <h2 className="font-display text-lg font-bold text-wood-800">{c.name}</h2>
              {!c.is_active ? <Badge>Hidden category</Badge> : null}
            </div>
            <Table>
              <thead><tr><Th>Item</Th><Th className="text-right">Price</Th><Th className="text-right">Cost (dine-in)</Th><Th className="text-right">Margin</Th><Th>Flags</Th><Th>Quick actions</Th></tr></thead>
              <tbody>
                {list.map((p) => {
                  const k = cost.get(p.id) as { dine_in_cost: number; dine_in_margin: number; has_recipe: boolean } | undefined;
                  return (
                    <Tr key={p.id}>
                      <Td>
                        <Link href={`/admin/menu/${p.id}`} className="flex items-center gap-3 font-semibold hover:underline">
                          <span className="w-14 shrink-0 overflow-hidden rounded-lg"><ProductImage src={p.image_url} slug={p.slug} name={p.name} sizes="56px" /></span>
                          {p.name}
                        </Link>
                      </Td>
                      <Td className="text-right font-semibold tabular-nums">{peso(p.price)}</Td>
                      <Td className="text-right tabular-nums">{k?.has_recipe ? peso(k.dine_in_cost) : <Link href="/admin/recipes" className="text-terracotta-600 underline">No recipe</Link>}</Td>
                      <Td className="text-right tabular-nums">{k?.has_recipe ? percent(k.dine_in_margin) : "—"}</Td>
                      <Td className="space-x-1 whitespace-nowrap">
                        {p.is_addon ? <Badge tone="blue">Add-on</Badge> : null}
                        {p.points_eligible ? <Badge tone="gold">Points</Badge> : null}
                        {p.is_featured ? <Badge tone="green">Featured</Badge> : null}
                        {p.is_demo ? <Badge>Sample</Badge> : null}
                      </Td>
                      <Td><ProductToggles id={p.id} available={p.is_available} archived={p.is_archived} /></Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        );
      })}
      {!products?.length ? <p className="text-ink-muted">No {showArchived ? "archived" : ""} items.</p> : null}
    </div>
  );
}
