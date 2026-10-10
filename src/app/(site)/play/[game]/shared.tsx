"use client";

import { Gift, PartyPopper, RotateCcw, Sparkles } from "lucide-react";
import { createContext, useContext, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { toFailure } from "@/lib/errors";
import { createClient } from "@/lib/supabase/client";

export type GameResult = {
  score: number;
  prize_type: "none" | "points" | "reward";
  points: number;
  label: string;
  reward_code?: string | null;
  reward_name?: string | null;
  note?: string | null;
  correct_answers?: { id: string; correct: number }[] | null;
  slice_index?: number;
};

const GameLock = createContext(false);

/**
 * Wraps a game. When the player has no tokens left the start button is disabled, but the
 * game itself stays mounted, so the result of the round that used the last token still shows.
 */
export function GameLockProvider({ locked, children }: { locked: boolean; children: ReactNode }) {
  return <GameLock.Provider value={locked}>{children}</GameLock.Provider>;
}
export const useGameLocked = () => useContext(GameLock);

/** Calls a game RPC as the signed-in player and normalises errors. */
export async function callGame<T>(fn: string, args?: Record<string, unknown>): Promise<{ data?: T; error?: string; cooldown?: number }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    const f = toFailure(error);
    return { error: f.error, cooldown: f.cooldown };
  }
  return { data: data as T };
}

/** Result pop-up with an X to close. "Play again" closes it and returns to the start screen. */
export function ResultDialog({ result, onClose, showScore = true }: { result: GameResult | null; onClose: () => void; showScore?: boolean }) {
  const won = !!result && result.prize_type !== "none";
  return (
    <Dialog open={!!result} onClose={onClose} title={won ? "You won!" : "Thanks for playing!"} className="max-w-md">
      {result ? (
        <div className="text-center">
          <span className={`mx-auto grid size-16 place-items-center rounded-full ${won ? "bg-gold-100 text-gold-700" : "bg-cream-200 text-wood-600"}`}>
            {won ? <PartyPopper className="size-8" /> : <Sparkles className="size-8" />}
          </span>
          {showScore ? <p className="mt-3 text-sm font-semibold uppercase tracking-widest text-ink-muted">Score {result.score}</p> : null}
          <p className="mt-1 font-display text-2xl font-extrabold text-wood-800">{result.label}</p>
          {result.note ? <p className="mt-1 text-sm text-ink-muted">{result.note}</p> : null}
          {result.reward_code ? (
            <div className="mx-auto mt-4 max-w-xs rounded-xl border-2 border-dashed border-forest-600/50 bg-leaf-50 p-4">
              <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-wood-700"><Gift className="size-4" /> {result.reward_name}</p>
              <p className="font-mono text-2xl font-bold tracking-wider text-forest-800">{result.reward_code}</p>
              <p className="text-xs text-ink-muted">Saved in Points &amp; rewards.</p>
            </div>
          ) : null}
          {result.points > 0 ? <p className="mt-3 text-sm text-leaf-700">+{result.points} points added to your balance.</p> : null}
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Button onClick={onClose}><RotateCcw /> Play again</Button>
            <Link href="/play" className="inline-flex h-11 items-center rounded-xl px-4 font-semibold text-forest-700 hover:bg-cream-200">Back to Play Zone</Link>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}

export function GameError({ message, cooldown }: { message: string; cooldown?: number }) {
  return (
    <Alert tone={cooldown ? "warning" : "error"} title={cooldown ? "Cooling down" : "Can't play right now"}>
      {message}
    </Alert>
  );
}
