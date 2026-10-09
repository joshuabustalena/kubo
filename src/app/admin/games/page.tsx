import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { Stat } from "@/components/admin/stat";
import { addDays, manilaToday } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Game, GamePrize } from "@/lib/types";
import { getStoreSettings } from "@/lib/data";
import { GameCard, QuizEditor, TokenSettings } from "./games-manager";

export const metadata: Metadata = { title: "Play Zone" };

export default async function GamesAdminPage() {
  const supabase = await createClient();
  const settings = await getStoreSettings();
  const today = manilaToday();
  const [{ data: games }, { data: prizes }, { data: rewards }, { data: questions }, loyalty] = await Promise.all([
    supabase.from("games").select("*").order("sort_order"),
    supabase.from("game_prizes").select("*").order("sort_order").order("id"),
    supabase.from("rewards").select("id, name").eq("is_active", true).order("name"),
    supabase.from("quiz_questions").select("*").order("created_at"),
    supabase.rpc("report_loyalty", { p_from: addDays(today, -6), p_to: today }),
  ]);
  const stats = ((loyalty.data?.game_rewards ?? []) as { game: string; rounds: number; points: number; coupons: number }[]);
  return (
    <div className="space-y-6">
      <PageHeader title="Play Zone" description="Turn games on or off, set daily limits, cooldowns, points caps and prizes. Scores and prizes are always decided on the server." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => <Stat key={s.game} label={`${s.game} (7d)`} value={`${s.rounds} rounds`} hint={`${s.points} pts · ${s.coupons} coupons`} />)}
      </div>
      <TokenSettings enabled={settings.game_tokens_enabled} cost={settings.game_token_cost} threshold={settings.points_price_threshold} low={settings.points_at_or_below} high={settings.points_above} />
      <div className="grid gap-6 xl:grid-cols-2">
        {((games ?? []) as Game[]).map((g) => (
          <GameCard key={g.code} game={g} prizes={((prizes ?? []) as GamePrize[]).filter((p) => p.game_code === g.code)} rewards={rewards ?? []} />
        ))}
      </div>
      <QuizEditor questions={(questions ?? []) as { id: string; question: string; choices: string[]; correct_index: number; explanation: string; is_active: boolean }[]} />
    </div>
  );
}
