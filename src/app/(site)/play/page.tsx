import { Brain, CircleDot, Gamepad2, HelpCircle, Lock, Ticket } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { getCurrentUser } from "@/lib/auth";
import { getStoreSettings } from "@/lib/data";
import { peso } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Game } from "@/lib/types";

export const metadata: Metadata = { title: "Play Zone" };

const ICONS = { catch: Gamepad2, memory: Brain, wheel: CircleDot, quiz: HelpCircle } as const;

export default async function PlayZonePage() {
  const [user, settings] = await Promise.all([getCurrentUser(), getStoreSettings()]);
  const supabase = await createClient();
  const cost = settings.game_tokens_enabled ? settings.game_token_cost : 0;
  const tokens = user?.game_tokens ?? 0;
  const canAfford = tokens >= cost;
  const { data: games } = await supabase.from("games").select("*").order("sort_order");
  let status: Record<string, { plays_today: number; daily_limit: number; points_today: number; points_cap: number }> = {};
  if (user) {
    const { data } = await supabase.rpc("my_game_status");
    status = data ?? {};
  }
  const list = (games ?? []) as Game[];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="woven paper overflow-hidden px-6 py-8">
        <h1 className="font-display text-4xl font-extrabold text-forest-800">Kainan sa Kubo Play Zone</h1>
        <p className="max-w-xl text-ink-soft">
          Quick games for a chance at bonus points and coupons. Games are optional — you never need to play to order or earn points from meals.
        </p>
      </div>
      {cost > 0 ? (
        <div className="paper mt-6 flex flex-wrap items-center gap-4 p-5">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gold-100 text-gold-700"><Ticket className="size-7" /></span>
          <div className="min-w-0 flex-1">
            {user ? (
              <p className="font-display text-2xl font-extrabold text-wood-800">{tokens} game token{tokens === 1 ? "" : "s"}</p>
            ) : (
              <p className="font-display text-2xl font-extrabold text-wood-800">Play with game tokens</p>
            )}
            <p className="text-sm text-ink-muted">
              Each round uses {cost} token{cost === 1 ? "" : "s"}. Earn tokens when you buy meals: {peso(settings.points_price_threshold)} and below = {settings.points_at_or_below} token, above = {settings.points_above} tokens per meal.
            </p>
          </div>
          {user && !canAfford ? <ButtonLink href="/menu" variant="gold">Order to get tokens</ButtonLink> : null}
        </div>
      ) : null}
      {!user ? (
        <Alert tone="info" className="mt-6" title="Log in to play">
          Games are tied to your account so prizes land in your points balance. <Link className="font-semibold underline" href="/login?next=/play">Log in</Link> or{" "}
          <Link className="font-semibold underline" href="/signup?next=/play">create an account</Link>.
        </Alert>
      ) : null}
      {list.length === 0 ? (
        <EmptyState icon={<Gamepad2 />} title="The Play Zone is being set up" />
      ) : (
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          {list.map((g) => {
            const Icon = ICONS[g.code] ?? Gamepad2;
            const st = status[g.code];
            const left = st ? Math.max(st.daily_limit - st.plays_today, 0) : g.daily_play_limit;
            return (
              <article key={g.code} className="paper flex flex-col p-5">
                <div className="flex items-start gap-4">
                  <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-forest-800 text-gold-300"><Icon className="size-7" /></span>
                  <div className="min-w-0">
                    <h2 className="font-display text-2xl font-bold text-wood-800">{g.name}</h2>
                    <p className="text-sm text-ink-muted">{g.tagline}</p>
                  </div>
                </div>
                <p className="mt-3 flex-1 text-sm text-ink-soft">{g.rules}</p>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone={left > 0 ? "green" : "neutral"}>{left} of {g.daily_play_limit} plays left today</Badge>
                    {st ? <Badge tone="gold">{st.points_today}/{st.points_cap} pts won today</Badge> : null}
                  </div>
                  {!g.is_enabled ? (
                    <Badge tone="neutral"><Lock className="size-3" /> Closed</Badge>
                  ) : user && !canAfford ? (
                    <Badge tone="neutral"><Ticket className="size-3" /> Need {cost} token{cost === 1 ? "" : "s"}</Badge>
                  ) : (
                    <ButtonLink href={`/play/${g.code}`} size="sm">{user ? (cost > 0 ? `Play · ${cost} token${cost === 1 ? "" : "s"}` : "Play") : "Log in to play"}</ButtonLink>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      <p className="mt-6 text-center text-xs text-ink-muted">
        Prizes are bonus loyalty points or store coupons only, are random or score-based as described, and are never guaranteed. Daily limits apply.
      </p>
    </div>
  );
}
