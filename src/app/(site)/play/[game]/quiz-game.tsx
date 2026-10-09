"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { callGame, GameError, ResultDialog, type GameResult } from "./shared";

type Question = { id: string; question: string; choices: string[] };
type Start = { session_id: string; expires_at: string; state: { questions: Question[]; time_limit_seconds: number } };

export function QuizGame() {
  const [session, setSession] = useState<Start | null>(null);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [current, setCurrent] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GameResult | null>(null);
  const [error, setError] = useState<{ message: string; cooldown?: number } | null>(null);
  const [left, setLeft] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const router = useRouter();

  const start = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    const res = await callGame<Start>("game_start", { p_code: "quiz" });
    setBusy(false);
    if (res.error || !res.data) return setError({ message: res.error ?? "Error", cooldown: res.cooldown });
    setSession(res.data);
    setDismissed(false);
    setAnswers(res.data.state.questions.map(() => null));
    setCurrent(0);
  };

  const finish = async (final: (number | null)[]) => {
    if (!session) return;
    setBusy(true);
    const res = await callGame<GameResult>("game_finish", { p_session_id: session.session_id, p_payload: { answers: final.map((a) => (a ?? -1)) } });
    setBusy(false);
    if (res.error || !res.data) return setError({ message: res.error ?? "Error" });
    setResult(res.data);
    router.refresh();
  };

  useEffect(() => {
    if (!session || result) return;
    const end = new Date(session.expires_at).getTime();
    const tick = () => setLeft(Math.max(0, Math.round((end - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [session, result]);

  if (result && session) {
    const correct = new Map((result.correct_answers ?? []).map((a) => [a.id, a.correct]));
    return (
      <div className="space-y-5">
        <ResultDialog result={dismissed ? null : result} onClose={() => setDismissed(true)} />
        <div className="paper p-5">
          <h2 className="font-display text-lg font-bold text-wood-800">Answers</h2>
          <ol className="mt-2 space-y-3 text-sm">
            {session.state.questions.map((q, i) => {
              const right = correct.get(q.id);
              const mine = answers[i];
              return (
                <li key={q.id}>
                  <p className="font-semibold">{i + 1}. {q.question}</p>
                  <p className={cn("flex items-center gap-1.5", mine === right ? "text-leaf-700" : "text-terracotta-600")}>
                    {mine === right ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
                    {right != null ? q.choices[right] : ""}
                  </p>
                </li>
              );
            })}
          </ol>
          <Button className="mt-5" onClick={() => { setSession(null); setResult(null); }}>Play again</Button>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="space-y-4">
        {error ? <GameError message={error.message} cooldown={error.cooldown} /> : null}
        <div className="paper p-6 text-center">
          <p className="text-ink-soft">5 questions · 2 minutes. Answers are checked by our server.</p>
          <Button size="lg" className="mt-4" onClick={start} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : null} Start quiz</Button>
        </div>
      </div>
    );
  }

  const q = session.state.questions[current];
  const last = current === session.state.questions.length - 1;
  return (
    <div className="paper p-5">
      {error ? <GameError message={error.message} /> : null}
      <div className="flex items-center justify-between text-sm font-semibold text-ink-muted">
        <span>Question {current + 1} of {session.state.questions.length}</span>
        <span className={left < 20 ? "text-terracotta-600" : ""}>{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</span>
      </div>
      <h2 className="mt-3 font-display text-2xl font-bold text-wood-800">{q.question}</h2>
      <div className="mt-4 grid gap-2" role="radiogroup" aria-label="Answers">
        {q.choices.map((c, i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={answers[current] === i}
            onClick={() => setAnswers((a) => a.map((x, j) => (j === current ? i : x)))}
            className={cn(
              "rounded-xl border-2 px-4 py-3 text-left font-semibold transition-colors",
              answers[current] === i ? "border-forest-700 bg-leaf-50 text-forest-800" : "border-bamboo-300 bg-cream-50 hover:bg-cream-200",
            )}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="mt-5 flex justify-between gap-3">
        <Button variant="ghost" disabled={current === 0} onClick={() => setCurrent((c) => c - 1)}>Back</Button>
        {last ? (
          <Button onClick={() => finish(answers)} disabled={busy || left === 0 || answers.some((a) => a === null)}>
            {busy ? <Loader2 className="animate-spin" /> : null} Submit answers
          </Button>
        ) : (
          <Button onClick={() => setCurrent((c) => c + 1)} disabled={answers[current] === null}>Next</Button>
        )}
      </div>
      {left === 0 ? <p className="mt-3 text-sm text-terracotta-600">Time&apos;s up — this round has expired. Start a new one from the Play Zone.</p> : null}
    </div>
  );
}
