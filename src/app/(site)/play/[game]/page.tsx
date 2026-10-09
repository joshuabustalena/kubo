import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/feedback";
import { ButtonLink } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { getStoreSettings } from "@/lib/data";
import { peso } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Game, GamePrize } from "@/lib/types";
import { CatchGame } from "./catch-game";
import { MemoryGame } from "./memory-game";
import { QuizGame } from "./quiz-game";
import { WheelGame } from "./wheel-game";

export const metadata: Metadata = { title: "Play" };

export default async function GamePage(props: PageProps<"/play/[game]">) {
  const { game: code } = await props.params;
  if (!["catch", "memory", "wheel", "quiz"].includes(code)) notFound();
  const [user, settings] = await Promise.all([requireUser(`/play/${code}`), getStoreSettings()]);
  const cost = settings.game_tokens_enabled ? settings.game_token_cost : 0;
  const supabase = await createClient();
  const [{ data: game }, { data: prizes }] = await Promise.all([
    supabase.from("games").select("*").eq("code", code).maybeSingle(),
    supabase.from("game_prizes").select("*").eq("game_code", code).eq("is_active", true).order("sort_order").order("id"),
  ]);
  if (!game) notFound();
  const g = game as Game;
  const prizeList = (prizes ?? []) as GamePrize[];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/play" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-forest-700 hover:underline">
        <ArrowLeft className="size-4" /> Play Zone
      </Link>
      <h1 className="font-display text-4xl font-extrabold text-forest-800">{g.name}</h1>
      <p className="mb-3 text-ink-muted">{g.rules}</p>
      {cost > 0 ? (
        <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-gold-100 px-3 py-1 text-sm font-semibold text-gold-700">
          You have {user.game_tokens} token{user.game_tokens === 1 ? "" : "s"} · each round uses {cost}
        </p>
      ) : null}
      {g.is_enabled && cost > 0 && user.game_tokens < cost ? (
        <Alert tone="warning" title="You need a game token to play">
          Earn tokens when you buy meals: {peso(settings.points_price_threshold)} and below = {settings.points_at_or_below} token, above = {settings.points_above} tokens per meal.
          <div className="mt-3"><ButtonLink href="/menu" size="sm">Order now</ButtonLink></div>
        </Alert>
      ) : !g.is_enabled ? (
        <Alert tone="warning" title="This game is closed right now.">Try another game in the Play Zone.</Alert>
      ) : code === "wheel" ? (
        <WheelGame prizes={prizeList.map((p) => ({ id: p.id, label: p.label, prize_type: p.prize_type }))} />
      ) : code === "memory" ? (
        <MemoryGame />
      ) : code === "quiz" ? (
        <QuizGame />
      ) : (
        <CatchGame />
      )}
      {code !== "wheel" && prizeList.some((p) => p.prize_type !== "none") ? (
        <div className="paper mt-6 p-5">
          <h2 className="font-display text-lg font-bold text-wood-800">Prize tiers</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {prizeList.filter((p) => p.prize_type !== "none").map((p) => (
              <li key={p.id} className="flex justify-between gap-3">
                <span>Score {p.min_score}+</span>
                <span className="font-semibold">{p.label}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-muted">Daily cap: {g.daily_points_cap} points from this game. {g.daily_play_limit} plays per day.</p>
        </div>
      ) : null}
    </div>
  );
}
