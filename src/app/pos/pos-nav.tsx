"use client";

import { ClipboardList, KeyRound, LayoutDashboard, LogOut, ShoppingCart, Ticket } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { KuboMark } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/pos", label: "Register", icon: ShoppingCart },
  { href: "/pos/orders", label: "Orders", icon: ClipboardList },
  { href: "/pos/rewards", label: "Rewards", icon: Ticket },
  { href: "/pos/me", label: "PIN", icon: KeyRound },
];

export function PosNav({ name, isAdmin }: { name: string; isAdmin: boolean }) {
  const path = usePathname();
  return (
    <header className="wood sticky top-0 z-40 no-print">
      <div className="flex h-14 items-center gap-2 px-3">
        <Link href="/pos" className="flex items-center gap-2 pr-2">
          <KuboMark className="size-8" />
          <span className="hidden font-display text-lg font-bold sm:inline">Kainan sa Kubo POS</span>
        </Link>
        <nav className="scrollbar-none flex flex-1 gap-1 overflow-x-auto">
          {LINKS.map((l) => {
            const active = l.href === "/pos" ? path === "/pos" : path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn("flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold", active ? "bg-gold-400 text-wood-800" : "text-cream-100 hover:bg-wood-600")}
              >
                <l.icon className="size-4" /> {l.label}
              </Link>
            );
          })}
          {isAdmin ? (
            <Link href="/admin" className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-cream-100 hover:bg-wood-600">
              <LayoutDashboard className="size-4" /> Admin
            </Link>
          ) : null}
        </nav>
        <span className="hidden text-sm text-bamboo-200 md:inline">{name}</span>
        <form action="/auth/signout" method="post">
          <button className="grid size-9 place-items-center rounded-lg text-cream-100 hover:bg-wood-600" aria-label="Log out">
            <LogOut className="size-4" />
          </button>
        </form>
      </div>
    </header>
  );
}
