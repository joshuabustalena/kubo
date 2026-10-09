import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { Alert } from "@/components/ui/feedback";
import { createClient } from "@/lib/supabase/server";
import type { Category, Product } from "@/lib/types";
import { ProductForm } from "./product-form";

export default async function EditProductPage(props: PageProps<"/admin/menu/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const isNew = id === "new";
  const supabase = await createClient();
  const [{ data: product }, { data: categories }, { data: addonCandidates }, { data: links }] = await Promise.all([
    isNew ? Promise.resolve({ data: null }) : supabase.from("products").select("*").eq("id", id).maybeSingle(),
    supabase.from("categories").select("*").order("sort_order"),
    supabase.from("products").select("id, name, price").eq("is_addon", true).eq("is_archived", false).order("sort_order"),
    isNew ? Promise.resolve({ data: [] }) : supabase.from("product_addons").select("addon_product_id").eq("product_id", id),
  ]);
  if (!isNew && !product) notFound();

  return (
    <div className="max-w-3xl">
      <Link href="/admin/menu" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-forest-700 hover:underline"><ArrowLeft className="size-4" /> Menu items</Link>
      <PageHeader title={isNew ? "New menu item" : (product as Product).name} description={isNew ? undefined : "Changes apply to new orders only — past orders keep their original prices."} />
      {sp.created ? <Alert tone="success" className="mb-4">Item created. Add its recipe in Recipes &amp; costing to track stock and cost.</Alert> : null}
      <ProductForm
        product={product as Product | null}
        categories={(categories ?? []) as Category[]}
        addons={(addonCandidates ?? []).filter((a) => a.id !== id).map((a) => ({ ...a, price: Number(a.price) }))}
        selectedAddons={(links ?? []).map((l: { addon_product_id: string }) => l.addon_product_id)}
      />
    </div>
  );
}
