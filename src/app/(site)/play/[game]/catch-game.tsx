"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { callGame, GameError, ResultDialog, type GameResult, useGameLocked } from "./shared";

type Item = { i: number; t: number; x: number; k: "rice" | "gold" | "rock" };
type Start = { session_id: string; started_at: string; resumed: boolean; state: { duration_seconds: number; items: Item[] } };

const FALL_MS = 2600;
const TRAY_W = 0.22; // fraction of width
const EMOJI = { rice: "🍚", gold: "⭐", rock: "🪨" } as const;

export function CatchGame() {
  const locked = useGameLocked();
  const [session, setSession] = useState<Start | null>(null);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [result, setResult] = useState<GameResult | null>(null);
  const [error, setError] = useState<{ message: string; cooldown?: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trayX = useRef(0.5);
  const lastLeft = useRef(-1);
  const state = useRef({ caught: new Set<number>(), hits: new Set<number>(), done: new Set<number>(), t0: 0, finished: false });
  const router = useRouter();

  const start = async () => {
    setBusy(true);
    setError(null);
    const res = await callGame<Start>("game_start", { p_code: "catch" });
    setBusy(false);
    if (res.error || !res.data) return setError({ message: res.error ?? "Error", cooldown: res.cooldown });
    const elapsed = res.data.resumed ? Math.max(0, Date.now() - new Date(res.data.started_at).getTime()) : 0;
    state.current = { caught: new Set(), hits: new Set(), done: new Set(), t0: performance.now() - elapsed, finished: false };
    setScore(0);
    setResult(null);
    setSession(res.data);
  };

  const finish = useCallback(async (s: Start) => {
    const st = state.current;
    if (st.finished) return;
    st.finished = true;
    const res = await callGame<GameResult>("game_finish", {
      p_session_id: s.session_id,
      p_payload: { caught: [...st.caught], hits: st.hits.size },
    });
    if (res.error || !res.data) return setError({ message: res.error ?? "Error" });
    setResult(res.data);
    setSession(null);
    router.refresh();
  }, [router]);

  // Game loop
  useEffect(() => {
    if (!session || result) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const duration = session.state.duration_seconds * 1000;
    let raf = 0;

    const resize = () => {
      const w = canvas.parentElement!.clientWidth;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr;
      canvas.height = 420 * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = "420px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const loop = () => {
      const st = state.current;
      const now = performance.now() - st.t0;
      const w = canvas.clientWidth;
      const h = 420;
      ctx.clearRect(0, 0, w, h);
      // greaseproof backdrop
      ctx.fillStyle = "#f4ecdc";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#e7dcc4";
      for (let y = 30; y < h; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

      const trayY = h - 46;
      const tw = Math.max(70, w * TRAY_W);
      const tx = trayX.current * w;
      ctx.font = "30px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji'";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      for (const it of session.state.items) {
        if (st.done.has(it.i)) continue;
        const age = now - it.t;
        if (age < 0) continue;
        const y = (age / FALL_MS) * (h + 20) - 20;
        const x = (it.x / 100) * w;
        if (y >= trayY - 14 && y <= trayY + 12 && Math.abs(x - tx) < tw / 2 + 10) {
          st.done.add(it.i);
          if (it.k === "rock") {
            st.hits.add(it.i);
            setScore((s) => Math.max(0, s - 2));
          } else {
            st.caught.add(it.i);
            setScore((s) => s + (it.k === "gold" ? 3 : 1));
          }
          continue;
        }
        if (y > h + 20) { st.done.add(it.i); continue; }
        ctx.fillText(EMOJI[it.k], x, y);
      }

      // tray: black tray with paper
      ctx.fillStyle = "#151515";
      ctx.beginPath();
      ctx.roundRect(tx - tw / 2, trayY, tw, 22, 8);
      ctx.fill();
      ctx.fillStyle = "#efe4cc";
      ctx.fillRect(tx - tw / 2 + 8, trayY + 5, tw - 16, 7);

      const secondsLeft = Math.max(0, Math.ceil((duration - now) / 1000));
      if (secondsLeft !== lastLeft.current) {
        lastLeft.current = secondsLeft;
        setTimeLeft(secondsLeft);
      }
      if (now >= duration + 400) {
        void finish(session);
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [session, result, finish]);

  // Controls: pointer/touch drag and arrow keys
  useEffect(() => {
    if (!session || result) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") trayX.current = Math.max(0.05, trayX.current - 0.06);
      if (e.key === "ArrowRight") trayX.current = Math.min(0.95, trayX.current + 0.06);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session, result]);

  const onPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    trayX.current = Math.min(0.95, Math.max(0.05, (e.clientX - rect.left) / rect.width));
  };

  if (!session) {
    return (
      <div className="space-y-4">
        {error ? <GameError message={error.message} cooldown={error.cooldown} /> : null}
        <div className="paper p-6 text-center">
          <p className="text-ink-soft">Drag (or use ← →) to move the tray. 🍚 = 1, ⭐ = 3, 🪨 = −2.</p>
          <Button size="lg" className="mt-4" onClick={start} disabled={busy || locked}>{busy ? <Loader2 className="animate-spin" /> : null} Start round</Button>
        </div>
        <ResultDialog result={result} onClose={() => setResult(null)} />
      </div>
    );
  }

  return (
    <div className="paper overflow-hidden">
      {error ? <GameError message={error.message} /> : null}
      <div className="flex justify-between bg-forest-800 px-4 py-2 font-display text-lg font-bold text-cream-50">
        <span>Score {score}</span>
        <span>{timeLeft}s</span>
      </div>
      <canvas
        ref={canvasRef}
        className="block touch-none select-none"
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        aria-label="Java Catch play area. Use left and right arrow keys to move the tray."
        tabIndex={0}
      />
      {timeLeft === 0 ? <p className="flex items-center justify-center gap-2 py-3 text-sm text-ink-muted"><Loader2 className="size-4 animate-spin" /> Checking your score…</p> : null}
    </div>
  );
}
