import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductImage } from "@/components/brand/meal-art";
import { getMenu, getStoreSettings } from "@/lib/data";
import { AddToCart } from "./add-to-cart";

export async function generateMetadata(props: PageProps<"/menu/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const { products } = await getMenu();
  const p = products.find((x) => x.slug === slug);
  return { title: p?.name ?? "Menu item", description: p?.description };
}

export default async function ProductPage(props: PageProps<"/menu/[slug]">) {
  const { slug } = await props.params;
  const [menu, settings] = await Promise.all([getMenu(), getStoreSettings()]);
  const product = menu.products.find((p) => p.slug === slug);
  if (!product) notFound();
  const category = menu.categories.find((c) => c.id === product.category_id);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Link href="/menu" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-forest-700 hover:underline">
        <ArrowLeft className="size-4" /> Back to menu
      </Link>
      <div className="grid gap-8 md:grid-cols-2">
        <div className="paper overflow-hidden">
          <ProductImage src={product.image_url} slug={product.slug} name={product.name} priority sizes="(max-width: 768px) 100vw, 50vw" />
        </div>
        <div>
          {category ? <p className="text-xs font-bold uppercase tracking-widest text-bamboo-600">{category.name}</p> : null}
          <h1 className="font-display text-4xl font-extrabold text-forest-800">{product.name}</h1>
          <p className="mt-2 text-ink-soft">{product.description}</p>
          <AddToCart product={product} rules={settings} />
        </div>
      </div>
    </div>
  );
}
