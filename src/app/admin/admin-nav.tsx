"use client";

import {
  BarChart3, Boxes, ChefHat, ClipboardList, Coins, Gamepad2, Gift, LayoutDashboard, LogOut, Menu, Receipt, ScrollText,
  Settings, ShoppingCart, Store, Tags, Truck, UserCog, Users, UtensilsCrossed,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { MobileDrawer } from "@/components/ui/mobile-drawer";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

const GROUPS = [
  { title: "Overview", links: [
    { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/orders", label: "Orders & refunds", icon: ClipboardList },
    { href: "/admin/reports", label: "Reports", icon: BarChart3 },
  ] },
  { title: "Menu & costing", links: [
    { href: "/admin/menu", label: "Menu items", icon: UtensilsCrossed },
    { href: "/admin/menu/categories", label: "Categories", icon: Tags },
    { href: "/admin/recipes", label: "Recipes & costing", icon: ChefHat },
  ] },
  { title: "Inventory", links: [
    { href: "/admin/inventory", label: "Stock", icon: Boxes },
    { href: "/admin/purchases", label: "Purchases", icon: ShoppingCart },
    { href: "/admin/suppliers", label: "Suppliers", icon: Truck },
    { href: "/admin/expenses", label: "Expenses", icon: Receipt },
  ] },
  { title: "Customers", links: [
    { href: "/admin/customers", label: "Customers", icon: Users },
    { href: "/admin/rewards", label: "Loyalty & rewards", icon: Gift },
    { href: "/admin/promotions", label: "Promotions", icon: Coins },
    { href: "/admin/games", label: "Play Zone", icon: Gamepad2 },
  ] },
  { title: "System", links: [
    { href: "/admin/staff", label: "Staff & access", icon: UserCog },
    { href: "/admin/audit", label: "Audit log", icon: ScrollText },
    { href: "/admin/settings", label: "Store settings", icon: Settings },
  ] },
];

export function AdminNav({ name }: { name: string }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  const isActive = (href: string) => {
    if (href === "/admin") return path === "/admin";
    if (href === "/admin/menu") return path === "/admin/menu" || /^\/admin\/menu\/(?!categories)/.test(path);
    return path.startsWith(href);
  };

  const links = (
    <nav className="space-y-4 px-3 py-4" aria-label="Admin">
      {GROUPS.map((g) => (
        <div key={g.title}>
          <p className="px-3 pb-1 text-[0.68rem] font-bold uppercase tracking-[0.18em] text-bamboo-300">{g.title}</p>
          {g.links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isActive(l.href) ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold",
                isActive(l.href) ? "bg-gold-400 text-wood-800" : "text-cream-100 hover:bg-wood-600",
              )}
            >
              <l.icon className="size-4" /> {l.label}
            </Link>
          ))}
        </div>
      ))}
      <div className="space-y-1 border-t border-wood-500/50 pt-3">
        <Link href="/pos" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-cream-100 hover:bg-wood-600"><Store className="size-4" /> Open POS</Link>
        <Link href="/" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-cream-100 hover:bg-wood-600"><Store className="size-4" /> Customer site</Link>
        <form action="/auth/signout" method="post">
          <button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-cream-100 hover:bg-wood-600"><LogOut className="size-4" /> Log out</button>
        </form>
        <p className="px-3 pt-1 text-xs text-bamboo-300">Signed in as {name}</p>
      </div>
    </nav>
  );

  return (
    <>
      {/* Mobile: top bar + slide-in menu */}
      <div className="wood no-print sticky top-0 z-40 flex h-14 items-center justify-between px-4 lg:hidden">
        <Logo light href="/admin" />
        <button type="button" onClick={() => setOpen(true)} className="grid size-10 place-items-center rounded-lg hover:bg-wood-600" aria-label="Open navigation" aria-expanded={open}>
          <Menu className="size-5" />
        </button>
      </div>
      <MobileDrawer open={open} onClose={close} title="Admin navigation" className="wood text-cream-100">
        <div className="px-5 py-5 pr-14"><Logo light href="/admin" /></div>
        <div className="bamboo-pole !h-[6px] !rounded-none" role="presentation" />
        {links}
      </MobileDrawer>

      {/* Desktop: fixed sidebar */}
      <aside className="wood no-print sticky top-0 hidden h-screen w-64 shrink-0 overflow-y-auto lg:block">
        <div className="px-5 py-5"><Logo light href="/admin" /></div>
        <div className="bamboo-pole !h-[6px] !rounded-none" role="presentation" />
        {links}
      </aside>
    </>
  );
}
