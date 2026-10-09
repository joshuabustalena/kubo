"use client";

import { Minus, Plus, ShoppingBag, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { useCart } from "@/lib/cart";
import type { MenuProduct } from "@/lib/data";
import { peso } from "@/lib/format";
import { pointsForLine, type PointsRules } from "@/lib/points";

export function AddToCart({ product, rules }: { product: MenuProduct; rules: PointsRules }) {
  const cart = useCart();
  const toast = useToast();
  const router = useRouter();
  const [qty, setQty] = useState(1);
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  const addons = product.addons.filter((a) => addonIds.includes(a.id));
  const unit = product.price + addons.reduce((s, a) => s + a.price, 0);
  const points = pointsForLine(
    { price: product.price, quantity: qty, pointsEligible: product.points_eligible, addons: addons.map((a) => ({ price: a.price, pointsEligible: a.points_eligible })) },
    rules,
  );

  const add = (goToCart: boolean) => {
    cart.add({
      productId: product.id,
      slug: product.slug,
      name: product.name,
      price: product.price,
      imageUrl: product.image_url,
      pointsEligible: product.points_eligible,
      quantity: qty,
      addons: addons.map((a) => ({ id: a.id, name: a.name, price: a.price })),
      notes,
    });
    toast.success(`${qty} × ${product.name} added to your tray.`);
    if (goToCart) router.push("/cart");
  };

  if (!product.is_available) {
    return <Alert tone="warning" className="mt-6" title="Sold out for now">Check back later or try another kubo favourite.</Alert>;
  }

  return (
    <div className="mt-6 space-y-5">
      <div className="flex items-center gap-3">
        <span className="font-display text-3xl font-extrabold text-forest-700">{peso(product.price)}</span>
        {points > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-gold-100 px-3 py-1 text-sm font-bold text-gold-700">
            <Sparkles className="size-4" /> Earn {points} point{points > 1 ? "s" : ""}
          </span>
        ) : null}
      </div>

      {product.addons.length > 0 ? (
        <fieldset className="paper p-4">
          <legend className="px-1 font-display text-lg font-bold text-wood-800">Add-ons</legend>
          <div className="mt-1 space-y-1">
            {product.addons.map((a) => (
              <label key={a.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-cream-200 has-disabled:cursor-not-allowed has-disabled:opacity-50">
                <span className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    className="size-4.5 accent-forest-700"
                    disabled={!a.is_available}
                    checked={addonIds.includes(a.id)}
                    onChange={(e) => setAddonIds((ids) => (e.target.checked ? [...ids, a.id] : ids.filter((x) => x !== a.id)))}
                  />
                  <span className="font-medium">{a.name}{!a.is_available ? " (sold out)" : ""}</span>
                </span>
                <span className="text-sm font-semibold text-wood-600">+{peso(a.price)}</span>
              </label>
            ))}
          </div>
          <p className="mt-2 px-2 text-xs text-ink-muted">One of each add-on per meal ordered.</p>
        </fieldset>
      ) : null}

      <Field label="Special instructions (optional)" htmlFor="notes">
        <Textarea id="notes" value={notes} maxLength={200} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. well-done egg, less rice" className="min-h-16" />
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center rounded-xl border border-bamboo-400 bg-cream-50">
          <button type="button" className="grid size-11 place-items-center text-wood-700 disabled:opacity-40" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="Decrease quantity">
            <Minus className="size-4" />
          </button>
          <span className="w-10 text-center text-lg font-bold" aria-live="polite">{qty}</span>
          <button type="button" className="grid size-11 place-items-center text-wood-700 disabled:opacity-40" onClick={() => setQty((q) => Math.min(20, q + 1))} disabled={qty >= 20} aria-label="Increase quantity">
            <Plus className="size-4" />
          </button>
        </div>
        <Button size="lg" onClick={() => add(false)} className="flex-1 sm:flex-none">
          <ShoppingBag /> Add {peso(unit * qty)}
        </Button>
        <Button size="lg" variant="outline" onClick={() => add(true)}>Add &amp; view tray</Button>
      </div>
    </div>
  );
}
