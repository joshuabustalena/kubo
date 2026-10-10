"use client";

import { ClipboardList, Gamepad2, Gift, Info, LayoutDashboard, LogIn, LogOut, MapPin, Menu, Store, UserRound, UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { Logo } from "@/components/brand/logo";
import { InstallAppButton } from "@/components/pwa/install-app";
import { MobileDrawer } from "@/components/ui/mobile-drawer";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/menu", label: "Menu", icon: UtensilsCrossed },
  { href: "/play", label: "Play Zone", icon: Gamepad2 },
  { href: "/account/rewards", label: "Rewards", icon: Gift },
  { href: "/about", label: "About", icon: Info },
  { href: "/contact", label: "Visit us", icon: MapPin },
];

type User = { name: string; points: number; role: "admin" | "staff" | "customer" } | null;

/** Customer-site menu for phones: a slide-in drawer that closes on outside tap or link tap. */
export function SiteMobileMenu({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const path = usePathname();
  const item = (href: string, exact = false) =>
    cn("flex items-center gap-3 rounded-xl px-3 py-3 font-semibold", (exact ? path === href : path.startsWith(href)) ? "bg-gold-100 text-wood-800" : "text-wood-700 hover:bg-cream-200");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="grid size-10 place-items-center rounded-xl text-wood-700 hover:bg-cream-200 md:hidden"
        aria-label="Open menu"
        aria-expanded={open}
      >
        <Menu className="size-5" />
      </button>
      <MobileDrawer open={open} onClose={close} title="Menu" className="bg-cream-50 text-ink">
        <div className="border-b border-bamboo-300/60 px-5 py-5 pr-14"><Logo /></div>
        {user ? (
          <div className="mx-4 mt-4 flex items-center justify-between rounded-xl bg-cream-200/70 px-4 py-3">
            <span className="flex items-center gap-2 font-semibold"><UserRound className="size-4" /> {user.name}</span>
            <span className="rounded-full bg-gold-100 px-2 py-0.5 text-xs font-bold text-gold-700">{user.points} pts</span>
          </div>
        ) : null}
        <nav className="flex flex-col gap-1 p-4" aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={item(n.href)}>
              <n.icon className="size-5" /> {n.label}
            </Link>
          ))}
          <InstallAppButton className="w-full rounded-xl px-3 py-3 text-left font-semibold text-forest-700 hover:bg-cream-200" />
          <div className="my-2 border-t border-bamboo-300/60" />
          {user ? (
            <>
              <Link href="/account" className={item("/account", true)}><UserRound className="size-5" /> My account</Link>
              <Link href="/account/orders" className={item("/account/orders")}><ClipboardList className="size-5" /> My orders</Link>
              {user.role !== "customer" ? (
                <Link href={user.role === "admin" ? "/admin" : "/pos"} className={item(user.role === "admin" ? "/admin" : "/pos")}>
                  {user.role === "admin" ? <LayoutDashboard className="size-5" /> : <Store className="size-5" />}
                  {user.role === "admin" ? "Admin dashboard" : "Staff POS"}
                </Link>
              ) : null}
              <form action="/auth/signout" method="post">
                <button data-close className="flex w-full items-center gap-3 rounded-xl px-3 py-3 font-semibold text-wood-700 hover:bg-cream-200">
                  <LogOut className="size-5" /> Log out
                </button>
              </form>
            </>
          ) : (
            <Link href="/login" className={item("/login")}><LogIn className="size-5" /> Log in / Sign up</Link>
          )}
        </nav>
      </MobileDrawer>
    </>
  );
}
