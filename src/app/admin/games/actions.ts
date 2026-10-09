"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminClient, bool, notAdmin, text } from "@/lib/admin";
import { ok, toFailure, type ActionResult } from "@/lib/errors";

export type FormState = { error?: string; saved?: boolean };

const gameSchema = z.object({
  name: z.string().trim().min(1).max(60),
  tagline: z.string().max(120),
  rules: z.string().max(800),
  is_enabled: z.boolean(),
  daily_play_limit: z.number().int().min(1, "At least 1 play per day.").max(50),
  cooldown_seconds: z.number().int().min(0).max(86400),
  daily_points_cap: z.number().int().min(0).max(1000),
});

export async function saveGame(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await adminClient();
  if (!ctx) return { error: notAdmin.error };
  const code = text(form, "code");
  const parsed = gameSchema.safeParse({
    name: text(form, "name"),
    tagline: text(form, "tagline"),
    rules: text(form, "rules"),
    is_enabled: bool(form, "is_enabled"),
    daily_play_limit: Number(text(form, "daily_play_limit")),
    cooldown_seconds: Number(text(form, "cooldown_seconds")),
    daily_points_cap: Number(text(form, "daily_points_cap")),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { error } = await ctx.supabase.from("games").update(parsed.data).eq("code", code);
  if (error) return { error: toFailure(error).error };
  revalidatePath("/admin/games");
  revalidatePath("/play", "layout");
  return { saved: true };
}

const prizeSchema = z.object({
  id: z.uuid().nullable(),
  game_code: z.enum(["catch", "memory", "wheel", "quiz"]),
  label: z.string().trim().min(1, "Label is required.").max(40),
  prize_type: z.enum(["none", "points", "reward"]),
  points: z.number().int().min(0).max(1000),
  reward_id: z.uuid().nullable(),
  weight: z.number().int().min(0).max(1000),
  min_score: z.number().int().min(0).max(100000),
  is_active: z.boolean(),
  sort_order: z.number().int().min(0).max(999),
}).refine((p) => p.prize_type !== "points" || p.points > 0, { message: "Points prizes need a number of points." })
  .refine((p) => p.prize_type !== "reward" || p.reward_id, { message: "Pick the coupon reward." });

export async function savePrize(raw: z.input<typeof prizeSchema>): Promise<ActionResult> {
  const ctx = await adminClient();
  if (!ctx) return notAdmin;
  const parsed = prizeSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { id, ...data } = parsed.data;
  const row = { ...data, points: data.prize_type === "points" ? data.points : 0, reward_id: data.prize_type === "reward" ? data.reward_id : null };
  const { error } = id ? await ctx.supabase.from("game_prizes").update(row).eq("id", id) : await ctx.supabase.from("game_prizes").insert(row);
  if (error) return toFailure(error);
  revalidatePath("/admin/games");
  return ok(undefined);
}

export async function deletePrize(id: string): Promise<ActionResult> {
  const ctx = await adminClient();
  if (!ctx) return notAdmin;
  const { error } = await ctx.supabase.from("game_prizes").update({ is_active: false }).eq("id", id);
  if (error) return toFailure(error);
  revalidatePath("/admin/games");
  return ok(undefined);
}

const questionSchema = z.object({
  id: z.uuid().nullable(),
  question: z.string().trim().min(5, "Write the question.").max(200),
  choices: z.array(z.string().trim().min(1).max(80)).min(2, "At least two choices.").max(6),
  correct_index: z.number().int().min(0),
  explanation: z.string().max(200),
  is_active: z.boolean(),
}).refine((q) => q.correct_index < q.choices.length, { message: "Pick the correct answer." });

export async function saveQuestion(raw: z.input<typeof questionSchema>): Promise<ActionResult> {
  const ctx = await adminClient();
  if (!ctx) return notAdmin;
  const parsed = questionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { id, ...data } = parsed.data;
  const { error } = id ? await ctx.supabase.from("quiz_questions").update(data).eq("id", id) : await ctx.supabase.from("quiz_questions").insert(data);
  if (error) return toFailure(error);
  revalidatePath("/admin/games");
  return ok(undefined);
}
