"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { callGame, GameError, ResultDialog, type GameResult } from "./shared";

const COLORS = ["#1f3d2b", "#e8b53a", "#6b4226", "#5e8c31", "#b85c38", "#c9a66b", "#2c5a3c", "#9a6c0c"];

export function WheelGame({ prizes }: { prizes: { id: string; label: string; prize_type: string }[] }) {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<GameResult | null>(null);
  const [error, setError] = useState<{ message: string; cooldown?: number } | null>(null);
  const router = useRouter();
  const n = Math.max(prizes.length, 1);
  const slice = 360 / n;

  const spin = async () => {
    setError(null);
    setResult(null);
    setSpinning(true);
    const res = await callGame<GameResult>("game_spin_wheel");
    if (res.error || !res.data) {
      setSpinning(false);
      setError({ message: res.error ?? "Something went wrong.", cooldown: res.cooldown });
      return;
    }
    const idx = res.data.slice_index ?? 0;
    // Land the pointer (top) in the middle of the winning slice
    const target = 360 - (idx * slice + slice / 2);
    setRotation((r) => r - (r % 360) + 360 * 5 + target);
    setTimeout(() => {
      setSpinning(false);
      setResult(res.data!);
      router.refresh();
    }, 4300);
  };

  const r = 150;
  const arc = (i: number) => {
    const a0 = ((i * slice - 90) * Math.PI) / 180;
    const a1 = (((i + 1) * slice - 90) * Math.PI) / 180;
    return `M0 0 L${r * Math.cos(a0)} ${r * Math.sin(a0)} A${r} ${r} 0 ${slice > 180 ? 1 : 0} 1 ${r * Math.cos(a1)} ${r * Math.sin(a1)} Z`;
  };

  return (
    <div className="space-y-5">
      {error ? <GameError message={error.message} cooldown={error.cooldown} /> : null}
      <div className="paper flex flex-col items-center p-6">
        <div className="relative w-full max-w-[340px]">
          <svg viewBox="-160 -170 320 330" className="w-full" role="img" aria-label="Prize wheel">
            <g style={{ transform: `rotate(${rotation}deg)`, transition: spinning ? "transform 4.2s cubic-bezier(.12,.66,.12,1)" : "none" }}>
              {prizes.map((p, i) => {
                const mid = ((i + 0.5) * slice - 90) * (Math.PI / 180);
                return (
                  <g key={p.id}>
                    <path d={arc(i)} fill={COLORS[i % COLORS.length]} stroke="#fdf9f1" strokeWidth="2" />
                    <text
                      x={Math.cos(mid) * 92}
                      y={Math.sin(mid) * 92}
                      fill={i % COLORS.length === 1 || i % COLORS.length === 5 ? "#3e2614" : "#fdf9f1"}
                      fontSize="12"
                      fontWeight="700"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      transform={`rotate(${(i + 0.5) * slice} ${Math.cos(mid) * 92} ${Math.sin(mid) * 92})`}
                    >
                      {p.label.length > 16 ? `${p.label.slice(0, 15)}…` : p.label}
                    </text>
                  </g>
                );
              })}
              <circle r="22" fill="#fdf9f1" stroke="#b08d57" strokeWidth="4" />
            </g>
            <path d="M0 -142 L-13 -166 L13 -166 Z" fill="#b85c38" stroke="#fdf9f1" strokeWidth="2" />
          </svg>
        </div>
        <Button size="lg" variant="gold" className="mt-4 min-w-48" onClick={spin} disabled={spinning || prizes.length === 0}>
          {spinning ? <Loader2 className="animate-spin" /> : null}
          {spinning ? "Spinning…" : "Spin the wheel"}
        </Button>
        <p className="mt-2 text-xs text-ink-muted">The prize is picked by our server the moment you spin.</p>
      </div>
      <ResultDialog result={result} onClose={() => setResult(null)} showScore={false} />
    </div>
  );
}
