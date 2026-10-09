"use client";

import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import Link from "next/link";
import { ProductImage } from "@/components/brand/meal-art";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, PageLoading } from "@/components/ui/feedback";
import { Input } from "@/components/ui/form";
import { useCart } from "@/lib/cart";
import { peso } from "@/lib/format";

export default function CartPage() {
  const cart = useCart();

  if (!cart.ready) return <PageLoading label="Loading your tray…" />;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display text-4xl font-extrabold text-forest-800">Your tray</h1>
      {cart.lines.length === 0 ? (
        <div className="paper mt-6">
          <EmptyState icon={<ShoppingBag />} title="Your tray is empty" action={<ButtonLink href="/menu">Browse the menu</ButtonLink>}>
            Add a Java Rice meal or two and they&apos;ll show up here.
          </EmptyState>
        </div>
      ) : (
        <>
          <ul className="mt-6 space-y-3">
            {cart.lines.map((l) => {
              const unit = l.price + l.addons.reduce((s, a) => s + a.price, 0);
              return (
                <li key={l.lineId} className="paper flex gap-3 p-3 sm:gap-4">
                  <Link href={`/menu/${l.slug}`} className="w-24 shrink-0 overflow-hidden rounded-xl sm:w-28">
                    <ProductImage src={l.imageUrl} slug={l.slug} name={l.name} sizes="112px" />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-display text-lg font-bold leading-tight text-wood-800">{l.name}</p>
                        {l.addons.length > 0 ? (
                          <p className="text-sm text-ink-muted">+ {l.addons.map((a) => a.name).join(", ")}</p>
                        ) : null}
                      </div>
                      <p className="shrink-0 font-bold text-forest-700">{peso(unit * l.quantity)}</p>
                    </div>
                    <Input
                      aria-label={`Notes for ${l.name}`}
                      value={l.notes}
                      onChange={(e) => cart.setNotes(l.lineId, e.target.value)}
                      placeholder="Add a note (optional)"
                      className="mt-2 h-9 text-sm"
                      maxLength={200}
                    />
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center rounded-lg border border-bamboo-400 bg-cream-50">
                        <button type="button" className="grid size-9 place-items-center" onClick={() => cart.setQuantity(l.lineId, l.quantity - 1)} aria-label="Decrease quantity">
                          <Minus className="size-4" />
                        </button>
                        <span className="w-8 text-center font-bold">{l.quantity}</span>
                        <button type="button" className="grid size-9 place-items-center disabled:opacity-40" disabled={l.quantity >= 20} onClick={() => cart.setQuantity(l.lineId, l.quantity + 1)} aria-label="Increase quantity">
                          <Plus className="size-4" />
                        </button>
                      </div>
                      <button type="button" onClick={() => cart.remove(l.lineId)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-semibold text-terracotta-600 hover:bg-terracotta-100">
                        <Trash2 className="size-4" /> Remove
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="paper mt-5 p-5">
            <div className="flex items-center justify-between text-lg">
              <span className="font-semibold">Subtotal</span>
              <span className="font-display text-2xl font-extrabold text-forest-700">{peso(cart.subtotal)}</span>
            </div>
            <p className="mt-1 text-sm text-ink-muted">Packaging fees, promos and points are calculated at checkout.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <ButtonLink href="/checkout" size="lg" className="flex-1">Checkout</ButtonLink>
              <ButtonLink href="/menu" size="lg" variant="outline">Add more</ButtonLink>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
