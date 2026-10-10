"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/account", label: "Profile" },
  { href: "/account/orders", label: "My orders" },
  { href: "/account/rewards", label: "Points & rewards" },
  { href: "/account/games", label: "Play history" },
];

export function AccountNav() {
  const path = usePathname();
  return (
    <nav aria-label="Account" className="mt-5 flex flex-wrap gap-x-1 border-b border-bamboo-300/60">
      {TABS.map((t) => {
        const active = t.href === "/account" ? path === "/account" : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px shrink-0 border-b-3 px-4 py-2.5 text-sm font-semibold",
              active ? "border-forest-700 text-forest-800" : "border-transparent text-ink-muted hover:text-wood-700",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
