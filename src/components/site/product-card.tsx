"use client";

import { Plus, Ticket } from "lucide-react";
import Link from "next/link";
import { ProductImage } from "@/components/brand/meal-art";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useCart } from "@/lib/cart";
import type { MenuProduct } from "@/lib/data";
import { peso } from "@/lib/format";
import { tokensForPrice, type PointsRules } from "@/lib/points";
import { isSoldOut, servingsLeft } from "@/lib/types";

export function ProductCard({ product, rules, priority }: { product: MenuProduct; rules: PointsRules; priority?: boolean }) {
  const cart = useCart();
  const toast = useToast();
  // Game tokens earned per meal (only meals earn them, like points)
  const tokens = product.points_eligible ? tokensForPrice(product.price, rules) : 0;
  const soldOut = isSoldOut(product);
  const left = servingsLeft(product);

  return (
    <article className="paper group flex flex-col overflow-hidden transition-shadow hover:shadow-[var(--shadow-lift)]">
      <Link href={`/menu/${product.slug}`} className="relative block" aria-label={`${product.name} details`}>
        <ProductImage src={product.image_url} slug={product.slug} name={product.name} priority={priority} />
        {soldOut ? (
          <span className="absolute inset-0 grid place-items-center bg-wood-800/55 font-display text-xl font-bold text-cream-50">Sold out</span>
        ) : null}
        {tokens > 0 ? (
          <Badge tone="gold" className="absolute left-3 top-3 shadow-sm" title="Game tokens for the Play Zone">
            <Ticket className="size-3" /> +{tokens} token{tokens > 1 ? "s" : ""}
          </Badge>
        ) : null}
      </Link>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="flex items-start justify-between gap-3">
          <Link href={`/menu/${product.slug}`} className="font-display text-lg font-bold leading-tight text-wood-800 hover:text-forest-700">
            {product.name}
          </Link>
          <span className="shrink-0 font-display text-lg font-extrabold text-forest-700">{peso(product.price)}</span>
        </div>
        <p className="line-clamp-2 text-sm text-ink-muted">{product.description}</p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          {!soldOut && left !== null && left <= 5 ? (
            <span className="text-sm font-bold text-terracotta-600">Only {left} left!</span>
          ) : product.addons.length > 0 ? (
            <Link href={`/menu/${product.slug}`} className="text-sm font-semibold text-forest-700 hover:underline">
              Add-ons available
            </Link>
          ) : (
            <span />
          )}
          <button
            type="button"
            disabled={soldOut}
            onClick={() => {
              cart.add({
                productId: product.id,
                slug: product.slug,
                name: product.name,
                price: product.price,
                imageUrl: product.image_url,
                pointsEligible: product.points_eligible,
                quantity: 1,
                addons: [],
                notes: "",
              });
              toast.success(`${product.name} added to your tray.`);
            }}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-forest-800 px-3.5 text-sm font-semibold text-cream-50 hover:bg-forest-700 disabled:opacity-40"
          >
            <Plus className="size-4" /> Add
          </button>
        </div>
      </div>
    </article>
  );
}
