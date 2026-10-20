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
    <article className="paper group flex overflow-hidden transition-shadow hover:shadow-[var(--shadow-lift)] sm:flex-col">
      {/* Phones: compact row (small photo left) so more of the menu fits on screen; sm+: big card */}
      <Link href={`/menu/${product.slug}`} className="relative m-2 mr-0 block w-32 shrink-0 overflow-hidden rounded-xl sm:m-0 sm:w-auto sm:rounded-none" aria-label={`${product.name} details`}>
        <ProductImage
          src={product.image_url}
          slug={product.slug}
          name={product.name}
          priority={priority}
          sizes="(max-width: 640px) 140px, 33vw"
          className="aspect-auto h-full min-h-24 w-full sm:aspect-[4/3] sm:h-auto sm:min-h-0"
        />
        {soldOut ? (
          <span className="absolute inset-0 grid place-items-center bg-wood-800/55 font-display text-base font-bold text-cream-50 sm:text-xl">Sold out</span>
        ) : null}
        {tokens > 0 ? (
          <Badge tone="gold" className="absolute left-1 top-1 px-1.5 text-[0.65rem] shadow-sm sm:left-3 sm:top-3 sm:px-2 sm:text-xs" title="Game tokens for the Play Zone">
            <Ticket className="size-3" /> +{tokens}<span className="hidden sm:inline">&nbsp;token{tokens > 1 ? "s" : ""}</span>
          </Badge>
        ) : null}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-3 sm:gap-1.5 sm:p-4">
        <div className="flex items-start justify-between gap-2 sm:gap-3">
          <Link href={`/menu/${product.slug}`} className="font-display text-base font-bold leading-tight text-wood-800 hover:text-forest-700 sm:text-lg">
            {product.name}
          </Link>
          <span className="shrink-0 font-display text-base font-extrabold text-forest-700 sm:text-lg">{peso(product.price)}</span>
        </div>
        <p className="line-clamp-2 text-xs text-ink-muted sm:text-sm">{product.description}</p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1.5 sm:pt-3">
          {!soldOut && left !== null && left <= 5 ? (
            <span className="text-xs font-bold text-terracotta-600 sm:text-sm">Only {left} left!</span>
          ) : product.addons.length > 0 ? (
            <Link href={`/menu/${product.slug}`} className="text-xs font-semibold text-forest-700 hover:underline sm:text-sm">
              Add-ons<span className="hidden sm:inline"> available</span>
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
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-forest-800 px-3 text-xs font-semibold text-cream-50 hover:bg-forest-700 disabled:opacity-40 sm:h-10 sm:gap-1.5 sm:rounded-xl sm:px-3.5 sm:text-sm"
          >
            <Plus className="size-4" /> Add
          </button>
        </div>
      </div>
    </article>
  );
}
