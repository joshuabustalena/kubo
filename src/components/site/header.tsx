import { ClipboardList, LayoutDashboard, LogIn, Menu as MenuIcon, Store, UserRound } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { CartButton } from "./cart-button";

const NAV = [
  { href: "/menu", label: "Menu" },
  { href: "/play", label: "Play Zone" },
  { href: "/account/rewards", label: "Rewards" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Visit us" },
];

export async function SiteHeader() {
  const user = await getCurrentUser();
  return (
    <header className="sticky top-0 z-40 border-b border-bamboo-400/40 bg-cream-50/95 backdrop-blur no-print">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
        <Logo />
        <nav aria-label="Main" className="ml-6 hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-lg px-3 py-2 text-sm font-semibold text-wood-700 hover:bg-cream-200">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          {user && user.role !== "customer" ? (
            <ButtonLink href={user.role === "admin" ? "/admin" : "/pos"} variant="ghost" size="sm" className="hidden sm:inline-flex">
              {user.role === "admin" ? <LayoutDashboard /> : <Store />}
              {user.role === "admin" ? "Admin" : "POS"}
            </ButtonLink>
          ) : null}
          {user ? (
            <ButtonLink href="/account" variant="ghost" size="sm" aria-label="My account">
              <UserRound />
              <span className="hidden sm:inline">{user.full_name.split(" ")[0] || "Account"}</span>
              <span className="rounded-full bg-gold-100 px-2 py-0.5 text-xs font-bold text-gold-700">{user.points_balance} pts</span>
            </ButtonLink>
          ) : (
            <ButtonLink href="/login" variant="ghost" size="sm">
              <LogIn />
              <span>Log in</span>
            </ButtonLink>
          )}
          <CartButton />
          <details className="group relative md:hidden">
            <summary className="grid size-10 cursor-pointer list-none place-items-center rounded-xl text-wood-700 hover:bg-cream-200 [&::-webkit-details-marker]:hidden" aria-label="Open menu">
              <MenuIcon className="size-5" />
            </summary>
            <div className="paper absolute right-0 top-12 w-56 p-2">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="block rounded-lg px-3 py-2.5 font-semibold text-wood-700 hover:bg-cream-200">
                  {n.label}
                </Link>
              ))}
              {user ? (
                <Link href="/account/orders" className="flex items-center gap-2 rounded-lg px-3 py-2.5 font-semibold text-wood-700 hover:bg-cream-200">
                  <ClipboardList className="size-4" /> My orders
                </Link>
              ) : null}
              {user && user.role !== "customer" ? (
                <Link href={user.role === "admin" ? "/admin" : "/pos"} className="block rounded-lg px-3 py-2.5 font-semibold text-forest-700 hover:bg-cream-200">
                  {user.role === "admin" ? "Admin dashboard" : "Staff POS"}
                </Link>
              ) : null}
            </div>
          </details>
        </div>
      </div>
      <div className="bamboo-pole !h-[5px] !rounded-none" role="presentation" />
    </header>
  );
}
