import { LogOut } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { AccountNav } from "./account-nav";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/account");
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-ink-muted">Hi,</p>
          <h1 className="font-display text-4xl font-extrabold text-forest-800">{user.full_name || (user.username ? `@${user.username}` : user.email)}</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-gold-100 px-4 py-2 text-center">
            <p className="font-display text-2xl font-extrabold leading-none text-gold-700">{user.points_balance}</p>
            <p className="text-xs font-semibold text-gold-700">points</p>
          </div>
          <form action="/auth/signout" method="post">
            <button className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-wood-700 hover:bg-cream-200">
              <LogOut className="size-4" /> Log out
            </button>
          </form>
        </div>
      </div>
      <AccountNav />
      <div className="mt-6">{children}</div>
    </div>
  );
}
