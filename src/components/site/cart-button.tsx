"use client";

import { ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useCart } from "@/lib/cart";

export function CartButton() {
  const { count, ready } = useCart();
  return (
    <Link
      href="/cart"
      className="relative grid size-10 place-items-center rounded-xl bg-forest-800 text-cream-50 hover:bg-forest-700"
      aria-label={ready ? `Cart, ${count} item${count === 1 ? "" : "s"}` : "Cart"}
    >
      <ShoppingBag className="size-5" />
      {ready && count > 0 ? (
        <span className="absolute -right-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full bg-gold-400 px-1 text-[0.7rem] font-extrabold text-wood-800 ring-2 ring-cream-50">
          {count}
        </span>
      ) : null}
    </Link>
  );
}
