import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { createClient } from "@/lib/supabase/server";
import type { Category } from "@/lib/types";
import { CategoryEditor } from "./category-editor";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const supabase = await createClient();
  const [{ data: categories }, { data: products }] = await Promise.all([
    supabase.from("categories").select("*").order("sort_order"),
    supabase.from("products").select("category_id").eq("is_archived", false),
  ]);
  const counts = new Map<string, number>();
  for (const p of products ?? []) counts.set(p.category_id, (counts.get(p.category_id) ?? 0) + 1);
  return (
    <div className="max-w-4xl">
      <PageHeader title="Categories" description="Menu sections, in the order customers see them." />
      <CategoryEditor categories={((categories ?? []) as Category[]).map((c) => ({ ...c, count: counts.get(c.id) ?? 0 }))} />
    </div>
  );
}
