"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { normalizePhone } from "@/lib/account";
import { getCurrentUser } from "@/lib/auth";
import { ok, toFailure, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

const profileSchema = z.object({
  full_name: z.string().trim().min(2, "Enter your name.").max(120),
  phone: z.string().nullable().refine((p) => p !== null, "Enter a valid mobile number, e.g. 0917 123 4567."),
  student_school: z.string().trim().max(120),
});

export type ProfileState = { error?: string; saved?: boolean };

export async function updateProfile(_: ProfileState, form: FormData): Promise<ProfileState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Please log in again." };
  const parsed = profileSchema.safeParse({
    full_name: form.get("full_name"),
    phone: normalizePhone(String(form.get("phone") ?? "")),
    student_school: form.get("student_school") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  // RLS limits this to the user's own row; a trigger blocks role/points/username edits
  const { error } = await supabase.from("profiles").update(parsed.data).eq("id", user.id);
  if (error) {
    return { error: /duplicate|profiles_phone_key/i.test(error.message) ? "That mobile number is already used by another account." : toFailure(error).error };
  }
  revalidatePath("/account", "layout");
  return { saved: true };
}

export async function redeemReward(rewardId: string): Promise<ActionResult<{ code: string; expires_at: string }>> {
  if (!z.uuid().safeParse(rewardId).success) return { ok: false, error: "Reward not found." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("redeem_reward", { p_reward_id: rewardId });
  if (error) return toFailure(error);
  revalidatePath("/account", "layout");
  return ok({ code: data.code as string, expires_at: data.expires_at as string });
}
