"use client";

import { ClipboardList, KeyRound, LayoutDashboard, LogOut, Menu, ShoppingCart, Ticket, UserCog, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { KuboMark } from "@/components/brand/logo";
import { InstallAppButton } from "@/components/pwa/install-app";
import { MobileDrawer } from "@/components/ui/mobile-drawer";
import { cn } from "@/lib/utils";

const BASE_LINKS = [
  { href: "/pos", label: "Register", menuLabel: "Register", icon: ShoppingCart },
  { href: "/pos/orders", label: "Orders", menuLabel: "Orders", icon: ClipboardList },
  { href: "/pos/rewards", label: "Rewards", menuLabel: "Rewards", icon: Ticket },
];
// Only people who can approve others need a PIN; plain cashiers just see their access.
const ME_LINK = {
  approver: { href: "/pos/me", label: "PIN", menuLabel: "My approval PIN", icon: KeyRound },
  cashier: { href: "/pos/me", label: "Me", menuLabel: "My access", icon: UserRound },
};

const ADMIN_LINKS = [
  { href: "/admin", label: "Admin dashboard", icon: LayoutDashboard },
  { href: "/admin/staff", label: "Staff & access", icon: UserCog },
];

const tab = (active: boolean) =>
  cn("flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold", active ? "bg-gold-400 text-wood-800" : "text-cream-100 hover:bg-wood-600");

export function PosNav({ name, isAdmin, canApprove }: { name: string; isAdmin: boolean; canApprove: boolean }) {
  const LINKS = [...BASE_LINKS, canApprove ? ME_LINK.approver : ME_LINK.cashier];
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const isActive = (href: string) => (href === "/pos" ? path === "/pos" : path.startsWith(href));

  return (
    <header className="wood sticky top-0 z-40 no-print">
      <div className="flex h-14 items-center gap-2 px-3">
        <Link href="/pos" className="flex items-center gap-2 pr-2">
          <KuboMark className="size-10" eager />
          <span className="hidden font-display text-lg font-bold xl:inline">Kainan sa Kubo POS</span>
        </Link>
        <nav className="flex flex-1 gap-1" aria-label="POS">
          {/* Phones/tablets: the three everyday tabs; the rest live in the menu */}
          {LINKS.slice(0, 3).map((l) => (
            <Link key={l.href} href={l.href} aria-label={l.label} className={cn(tab(isActive(l.href)), "lg:hidden")}>
              <l.icon className="size-4" /> <span className="hidden sm:inline">{l.label}</span>
            </Link>
          ))}
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={cn(tab(isActive(l.href)), "hidden lg:flex")}>
              <l.icon className="size-4" /> {l.label}
            </Link>
          ))}
          {isAdmin ? (
            <Link href="/admin" className={cn(tab(false), "hidden lg:flex")}>
              <LayoutDashboard className="size-4" /> Admin
            </Link>
          ) : null}
        </nav>
        <span className="hidden text-sm text-bamboo-200 lg:inline">{name}</span>
        <form action="/auth/signout" method="post" className="hidden lg:block">
          <button className="grid size-9 place-items-center rounded-lg text-cream-100 hover:bg-wood-600" aria-label="Log out">
            <LogOut className="size-4" />
          </button>
        </form>
        <button type="button" onClick={() => setOpen(true)} className="grid size-10 place-items-center rounded-lg text-cream-100 hover:bg-wood-600 lg:hidden" aria-label="Open menu" aria-expanded={open}>
          <Menu className="size-5" />
        </button>
      </div>

      <MobileDrawer open={open} onClose={close} title="POS menu" className="wood text-cream-100">
        <div className="flex items-center gap-2 px-5 py-5 pr-14">
          <KuboMark className="size-10" eager />
          <span className="font-display text-lg font-bold">Kainan sa Kubo POS</span>
        </div>
        <div className="bamboo-pole !h-[6px] !rounded-none" role="presentation" />
        <nav className="space-y-4 px-3 py-4" aria-label="POS menu">
          <div>
            <p className="px-3 pb-1 text-[0.68rem] font-bold uppercase tracking-[0.18em] text-bamboo-300">Counter</p>
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} aria-current={isActive(l.href) ? "page" : undefined} className={cn(tab(isActive(l.href)), "gap-2.5")}>
                <l.icon className="size-4" /> {l.menuLabel}
              </Link>
            ))}
          </div>
          {isAdmin ? (
            <div>
              <p className="px-3 pb-1 text-[0.68rem] font-bold uppercase tracking-[0.18em] text-bamboo-300">Admin</p>
              {ADMIN_LINKS.map((l) => (
                <Link key={l.href} href={l.href} className={cn(tab(false), "gap-2.5")}>
                  <l.icon className="size-4" /> {l.label}
                </Link>
              ))}
            </div>
          ) : null}
          <div className="space-y-1 border-t border-wood-500/50 pt-3">
            <InstallAppButton label="Install POS app" className="w-full gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-cream-100 hover:bg-wood-600 [&_svg]:size-4" />
            <form action="/auth/signout" method="post">
              <button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-cream-100 hover:bg-wood-600"><LogOut className="size-4" /> Log out</button>
            </form>
            <p className="px-3 pt-1 text-xs text-bamboo-300">Signed in as {name}</p>
          </div>
        </nav>
      </MobileDrawer>
    </header>
  );
}
