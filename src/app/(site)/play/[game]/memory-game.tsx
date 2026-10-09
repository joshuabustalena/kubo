"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { callGame, GameError, ResultDialog, type GameResult } from "./shared";

const FACES: Record<string, { emoji: string; label: string }> = {
  rice: { emoji: "🍚", label: "Java Rice" },
  hotdog: { emoji: "🌭", label: "Hotdog" },
  chicken: { emoji: "🍗", label: "Chicken" },
  egg: { emoji: "🍳", label: "Egg" },
  pork: { emoji: "🥓", label: "Liempo" },
  fish: { emoji: "🐟", label: "Bangus" },
  drink: { emoji: "🧋", label: "Iced tea" },
  chili: { emoji: "🌶️", label: "Sili" },
};

type Start = { session_id: string; state: { cards: number; matched?: number[]; moves?: number } };
type Flip = { index: number; symbol: string; first: boolean; other_index?: number; match?: boolean; moves?: number; done?: boolean; expired?: boolean };

export function MemoryGame() {
  const [session, setSession] = useState<Start | null>(null);
  const [faces, setFaces] = useState<Record<number, string>>({});
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [open, setOpen] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [result, setResult] = useState<GameResult | null>(null);
  const [error, setError] = useState<{ message: string; cooldown?: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const router = useRouter();

  const start = async () => {
    setBusy(true);
    setError(null);
    const res = await callGame<Start>("game_start", { p_code: "memory" });
    setBusy(false);
    if (res.error || !res.data) return setError({ message: res.error ?? "Error", cooldown: res.cooldown });
    setSession(res.data);
    setMatched(new Set(res.data.state.matched ?? []));
    setMoves(res.data.state.moves ?? 0);
    setFaces({});
    setOpen([]);
    setResult(null);
  };

  const finish = async (s: Start) => {
    const res = await callGame<GameResult>("game_finish", { p_session_id: s.session_id, p_payload: {} });
    if (res.error || !res.data) return setError({ message: res.error ?? "Error" });
    setResult(res.data);
    setSession(null);
    router.refresh();
  };

  const flip = async (i: number) => {
    if (!session || lock.current || matched.has(i) || open.includes(i)) return;
    lock.current = true;
    const res = await callGame<Flip>("game_memory_flip", { p_session_id: session.session_id, p_index: i });
    if (res.error || !res.data) {
      lock.current = false;
      return setError({ message: res.error ?? "Error" });
    }
    const f = res.data;
    if (f.expired) {
      lock.current = false;
      return setError({ message: "Time's up! This round expired." });
    }
    setFaces((m) => ({ ...m, [f.index]: f.symbol }));
    if (f.first) {
      setOpen([f.index]);
      lock.current = false;
      return;
    }
    setOpen([f.other_index!, f.index]);
    setMoves(f.moves ?? 0);
    if (f.match) {
      setMatched((m) => new Set([...m, f.index, f.other_index!]));
      setOpen([]);
      lock.current = false;
      if (f.done) await finish(session);
    } else {
      setTimeout(() => {
        setOpen([]);
        lock.current = false;
      }, 750);
    }
  };

  if (!session) {
    return (
      <div className="space-y-4">
        {error ? <GameError message={error.message} cooldown={error.cooldown} /> : null}
        <div className="paper p-6 text-center">
          <p className="text-ink-soft">16 cards, 8 pairs, 3 minutes. Fewer moves = higher score.</p>
          <Button size="lg" className="mt-4" onClick={start} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : null} Start game</Button>
        </div>
        <ResultDialog result={result} onClose={() => setResult(null)} />
      </div>
    );
  }

  return (
    <div className="paper p-4 sm:p-5">
      {error ? <GameError message={error.message} /> : null}
      <div className="mb-3 flex justify-between text-sm font-semibold text-ink-muted">
        <span>Moves: {moves}</span>
        <span>Pairs: {matched.size / 2} / {session.state.cards / 2}</span>
      </div>
      <div className="mx-auto grid max-w-md grid-cols-4 gap-2 sm:gap-3">
        {Array.from({ length: session.state.cards }, (_, i) => {
          const shown = matched.has(i) || open.includes(i);
          const face = FACES[faces[i]];
          return (
            <button
              key={i}
              type="button"
              onClick={() => flip(i)}
              disabled={matched.has(i)}
              aria-label={shown && face ? face.label : `Card ${i + 1}`}
              className={cn(
                "grid aspect-square place-items-center rounded-xl text-3xl shadow-sm transition-transform duration-200 sm:text-4xl",
                shown ? "bg-cream-50 ring-2 ring-bamboo-400" : "woven ring-1 ring-bamboo-500 hover:-translate-y-0.5",
                matched.has(i) && "bg-leaf-50 ring-leaf-500",
              )}
            >
              {shown && face ? <span aria-hidden>{face.emoji}</span> : <span className="text-base font-display font-bold text-wood-600" aria-hidden>JK</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
