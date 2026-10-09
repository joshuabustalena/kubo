"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { useToast } from "@/components/ui/toast";
import type { Game, GamePrize } from "@/lib/types";
import { saveTokenSettings } from "../rewards/actions";
import { deletePrize, saveGame, savePrize, saveQuestion, type FormState } from "./actions";

export function GameCard({ game, prizes, rewards }: { game: Game; prizes: GamePrize[]; rewards: { id: string; name: string }[] }) {
  const [state, action] = useActionState<FormState, FormData>(saveGame, {});
  const [editing, setEditing] = useState<GamePrize | "new" | null>(null);
  const router = useRouter();
  const toast = useToast();
  const isWheel = game.code === "wheel";
  const active = prizes.filter((p) => p.is_active);
  const totalWeight = active.reduce((s, p) => s + p.weight, 0);
  return (
    <Card>
      <CardHeader title={game.name} action={<Badge tone={game.is_enabled ? "green" : "neutral"}>{game.is_enabled ? "Enabled" : "Disabled"}</Badge>} />
      <CardBody className="space-y-4">
        <form action={action} className="space-y-3">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}
          {state.saved ? <Alert tone="success">Saved.</Alert> : null}
          <input type="hidden" name="code" value={game.code} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" htmlFor={`${game.code}-name`}><Input id={`${game.code}-name`} name="name" defaultValue={game.name} maxLength={60} /></Field>
            <Field label="Tagline" htmlFor={`${game.code}-tag`}><Input id={`${game.code}-tag`} name="tagline" defaultValue={game.tagline} maxLength={120} /></Field>
          </div>
          <Field label="Rules shown to players" htmlFor={`${game.code}-rules`}><Textarea id={`${game.code}-rules`} name="rules" defaultValue={game.rules} maxLength={800} className="min-h-16" /></Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Plays per day" htmlFor={`${game.code}-lim`}><Input id={`${game.code}-lim`} name="daily_play_limit" type="number" min={1} max={50} defaultValue={game.daily_play_limit} /></Field>
            <Field label="Cooldown (seconds)" htmlFor={`${game.code}-cd`}><Input id={`${game.code}-cd`} name="cooldown_seconds" type="number" min={0} defaultValue={game.cooldown_seconds} /></Field>
            <Field label="Daily points cap" htmlFor={`${game.code}-cap`}><Input id={`${game.code}-cap`} name="daily_points_cap" type="number" min={0} defaultValue={game.daily_points_cap} /></Field>
          </div>
          <Checkbox name="is_enabled" label="Game is open to players" defaultChecked={game.is_enabled} />
          <SubmitButton size="sm" pendingText="Saving…">Save settings</SubmitButton>
        </form>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-bold text-wood-700">{isWheel ? "Wheel slices (chance = weight ÷ total)" : "Prize tiers (highest score reached wins)"}</p>
            <Button size="sm" variant="outline" onClick={() => setEditing("new")}><Plus /> Add</Button>
          </div>
          <ul className="divide-y divide-bamboo-300/40 rounded-xl ring-1 ring-bamboo-300/50">
            {prizes.map((p) => (
              <li key={p.id} className={`flex items-center justify-between gap-2 px-3 py-2 text-sm ${p.is_active ? "" : "opacity-50"}`}>
                <span>
                  <span className="font-semibold">{p.label}</span>{" "}
                  <span className="text-ink-muted">
                    {isWheel ? `weight ${p.weight}${totalWeight && p.is_active ? ` (${Math.round((p.weight / totalWeight) * 100)}%)` : ""}` : `score ≥ ${p.min_score}`}
                    {p.prize_type === "points" ? ` · ${p.points} pts` : p.prize_type === "reward" ? ` · coupon` : ""}
                    {!p.is_active ? " · off" : ""}
                  </span>
                </span>
                <span className="flex gap-1">
                  <Button size="icon" variant="ghost" aria-label="Edit" onClick={() => setEditing(p)}><Pencil /></Button>
                  {p.is_active ? <Button size="icon" variant="ghost" aria-label="Turn off" onClick={async () => { const r = await deletePrize(p.id); if (!r.ok) toast.error(r.error); router.refresh(); }}><Trash2 /></Button> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </CardBody>
      {editing ? <PrizeDialog game={game} prize={editing === "new" ? null : editing} rewards={rewards} onClose={() => { setEditing(null); router.refresh(); }} /> : null}
    </Card>
  );
}

function PrizeDialog({ game, prize, rewards, onClose }: { game: Game; prize: GamePrize | null; rewards: { id: string; name: string }[]; onClose: () => void }) {
  const [label, setLabel] = useState(prize?.label ?? "");
  const [type, setType] = useState<GamePrize["prize_type"]>(prize?.prize_type ?? "points");
  const [points, setPoints] = useState(String(prize?.points ?? 1));
  const [reward, setReward] = useState(prize?.reward_id ?? "");
  const [weight, setWeight] = useState(String(prize?.weight ?? 10));
  const [minScore, setMinScore] = useState(String(prize?.min_score ?? 0));
  const [active, setActive] = useState(prize?.is_active ?? true);
  const [order, setOrder] = useState(String(prize?.sort_order ?? 0));
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  return (
    <Dialog
      open
      onClose={onClose}
      title={prize ? "Edit prize" : "New prize"}
      footer={<>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={busy} onClick={() => start(async () => {
          const res = await savePrize({ id: prize?.id ?? null, game_code: game.code, label, prize_type: type, points: Number(points), reward_id: reward || null, weight: Number(weight), min_score: Number(minScore), is_active: active, sort_order: Number(order) });
          if (!res.ok) return setError(res.error);
          onClose();
        })}>Save</Button>
      </>}
    >
      {error ? <Alert tone="error" className="mb-3">{error}</Alert> : null}
      <div className="space-y-3">
        <Field label="Label shown to players" htmlFor="pz-label"><Input id="pz-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} /></Field>
        <Field label="Prize" htmlFor="pz-type">
          <Select id="pz-type" value={type} onChange={(e) => setType(e.target.value as GamePrize["prize_type"])}>
            <option value="none">No prize</option><option value="points">Bonus points</option><option value="reward">Coupon (reward)</option>
          </Select>
        </Field>
        {type === "points" ? <Field label="Points" htmlFor="pz-pts"><Input id="pz-pts" type="number" min={1} value={points} onChange={(e) => setPoints(e.target.value)} /></Field> : null}
        {type === "reward" ? (
          <Field label="Coupon" htmlFor="pz-rw" hint="Create game-only coupons in Loyalty & rewards (untick “redeemable with points”).">
            <Select id="pz-rw" value={reward} onChange={(e) => setReward(e.target.value)}><option value="">Choose…</option>{rewards.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
          </Field>
        ) : null}
        {game.code === "wheel" ? (
          <Field label="Weight (relative chance)" htmlFor="pz-w"><Input id="pz-w" type="number" min={0} value={weight} onChange={(e) => setWeight(e.target.value)} /></Field>
        ) : (
          <Field label="Minimum score" htmlFor="pz-ms" hint={game.code === "quiz" ? "Correct answers (out of 5)." : game.code === "memory" ? "100 = perfect game." : "Rice caught minus penalties."}>
            <Input id="pz-ms" type="number" min={0} value={minScore} onChange={(e) => setMinScore(e.target.value)} />
          </Field>
        )}
        <Field label="Order" htmlFor="pz-order"><Input id="pz-order" type="number" min={0} value={order} onChange={(e) => setOrder(e.target.value)} /></Field>
        <Checkbox label="Active" checked={active} onChange={(e) => setActive(e.target.checked)} />
      </div>
    </Dialog>
  );
}

type Q = { id: string; question: string; choices: string[]; correct_index: number; explanation: string; is_active: boolean };

export function QuizEditor({ questions }: { questions: Q[] }) {
  const [editing, setEditing] = useState<Q | "new" | null>(null);
  const router = useRouter();
  return (
    <Card>
      <CardHeader title="Food Quiz questions" description="Answers are never sent to players' browsers." action={<Button size="sm" onClick={() => setEditing("new")}><Plus /> Add question</Button>} />
      <ul className="divide-y divide-bamboo-300/40">
        {questions.map((q) => (
          <li key={q.id} className={`flex items-start justify-between gap-3 px-5 py-3 ${q.is_active ? "" : "opacity-50"}`}>
            <div className="text-sm">
              <p className="font-semibold">{q.question}</p>
              <p className="text-ink-muted">Answer: {q.choices[q.correct_index]}{!q.is_active ? " · inactive" : ""}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setEditing(q)}><Pencil /> Edit</Button>
          </li>
        ))}
      </ul>
      {editing ? <QuestionDialog q={editing === "new" ? null : editing} onClose={() => { setEditing(null); router.refresh(); }} /> : null}
    </Card>
  );
}

function QuestionDialog({ q, onClose }: { q: Q | null; onClose: () => void }) {
  const [question, setQuestion] = useState(q?.question ?? "");
  const [choices, setChoices] = useState<string[]>(q?.choices ?? ["", "", "", ""]);
  const [correct, setCorrect] = useState(q?.correct_index ?? 0);
  const [explanation, setExplanation] = useState(q?.explanation ?? "");
  const [active, setActive] = useState(q?.is_active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  return (
    <Dialog open onClose={onClose} title={q ? "Edit question" : "New question"} footer={<>
      <Button variant="outline" onClick={onClose}>Cancel</Button>
      <Button disabled={busy} onClick={() => start(async () => {
        const filled = choices.map((c) => c.trim()).filter(Boolean);
        const res = await saveQuestion({ id: q?.id ?? null, question, choices: filled, correct_index: Math.min(correct, filled.length - 1), explanation, is_active: active });
        if (!res.ok) return setError(res.error);
        onClose();
      })}>Save</Button>
    </>}>
      {error ? <Alert tone="error" className="mb-3">{error}</Alert> : null}
      <div className="space-y-3">
        <Field label="Question" htmlFor="qq"><Textarea id="qq" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={200} className="min-h-14" /></Field>
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-wood-700">Choices (select the correct one)</legend>
          {choices.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="radio" name="correct" checked={correct === i} onChange={() => setCorrect(i)} className="accent-forest-700" aria-label={`Choice ${i + 1} is correct`} />
              <Input value={c} onChange={(e) => setChoices((cs) => cs.map((x, j) => (j === i ? e.target.value : x)))} maxLength={80} className="h-10" aria-label={`Choice ${i + 1}`} />
            </div>
          ))}
        </fieldset>
        <Field label="Explanation (optional)" htmlFor="qe"><Input id="qe" value={explanation} onChange={(e) => setExplanation(e.target.value)} maxLength={200} /></Field>
        <Checkbox label="Active" checked={active} onChange={(e) => setActive(e.target.checked)} />
      </div>
    </Dialog>
  );
}

export function TokenSettings({ enabled, cost, threshold, low, high }: { enabled: boolean; cost: number; threshold: number; low: number; high: number }) {
  const [on, setOn] = useState(enabled);
  const [perRound, setPerRound] = useState(String(cost));
  const [busy, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <Card>
      <CardHeader title="Game tokens" description={`Customers earn tokens on completed, paid orders: ₱${threshold} and below = ${low} per meal, above = ${high} per meal (same price rule as points). Refunds take them back.`} />
      <CardBody className="flex flex-wrap items-end gap-4">
        <Checkbox label="Require a token to play" checked={on} onChange={(e) => setOn(e.target.checked)} />
        <Field label="Tokens per round" htmlFor="tok-cost" className="w-36"><Input id="tok-cost" type="number" min={0} max={10} value={perRound} onChange={(e) => setPerRound(e.target.value)} /></Field>
        <Button disabled={busy} onClick={() => start(async () => {
          const res = await saveTokenSettings(on, Number(perRound));
          if (res.ok) toast.success("Token settings saved."); else toast.error(res.error);
          router.refresh();
        })}>Save</Button>
      </CardBody>
    </Card>
  );
}
