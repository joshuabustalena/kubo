"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { loginEmailFor, normalizePhone, normalizeUsername, USERNAME_RULE } from "@/lib/account";
import { safeNext } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string; fields?: Record<string, string> };

/**
 * Finds the sign-in address for what the user typed: a username, a mobile
 * number, or (for older/staff accounts) an email address.
 */
async function resolveLoginEmail(identifier: string): Promise<string | null> {
  const id = identifier.trim();
  if (id.includes("@")) return id.toLowerCase();
  const service = createServiceClient();
  const phone = normalizePhone(id);
  const query = service.from("profiles").select("email").limit(1);
  if (phone) {
    const { data } = await query.eq("phone", phone).maybeSingle();
    return data?.email || null;
  }
  const username = normalizeUsername(id);
  const { data } = await query.eq("username", username).maybeSingle();
  // Fallback: username accounts always use this address, even if the profile
  // row is missing its username (e.g. created before the username migration)
  return data?.email || (USERNAME_RULE.test(username) ? loginEmailFor(username) : null);
}

export async function login(_: AuthState, form: FormData): Promise<AuthState> {
  const identifier = String(form.get("identifier") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const fields = { identifier };
  if (!identifier) return { error: "Enter your username or mobile number.", fields };
  if (!password) return { error: "Enter your password.", fields };

  let email: string | null;
  try {
    email = await resolveLoginEmail(identifier);
  } catch {
    return { error: "Sign-in isn't set up on the server yet (missing SUPABASE_SECRET_KEY).", fields };
  }
  const wrong = { error: "Incorrect username, mobile number or password.", fields };
  if (!email) return wrong;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return wrong;

  const { data: claims } = await supabase.auth.getClaims();
  const { data: profile } = await supabase.from("profiles").select("role, is_active").eq("id", claims?.claims?.sub ?? "").maybeSingle();
  if (profile && !profile.is_active) {
    await supabase.auth.signOut();
    return { error: "This account has been deactivated. Please contact Kainan sa Kubo.", fields };
  }
  const fallback = profile?.role === "admin" ? "/admin" : profile?.role === "staff" ? "/pos" : "/menu";
  redirect(safeNext(String(form.get("next") ?? ""), fallback));
}

const signupSchema = z
  .object({
    username: z.string().regex(USERNAME_RULE, "Username: 3–20 letters, numbers, dots or underscores (no spaces)."),
    phone: z.string().nullable().refine((p) => p !== null, "Enter a valid mobile number, e.g. 0917 123 4567."),
    password: z.string().min(8, "Use at least 8 characters for your password.").max(72),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "Passwords do not match.", path: ["confirm"] });

export async function signup(_: AuthState, form: FormData): Promise<AuthState> {
  const rawUsername = String(form.get("username") ?? "");
  const rawPhone = String(form.get("phone") ?? "");
  const fields = { username: rawUsername, phone: rawPhone };
  const parsed = signupSchema.safeParse({
    username: normalizeUsername(rawUsername),
    phone: normalizePhone(rawPhone),
    password: String(form.get("password") ?? ""),
    confirm: String(form.get("confirm") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields };
  const { username, phone, password } = parsed.data;

  let service;
  try {
    service = createServiceClient();
  } catch {
    return { error: "Sign-up isn't set up on the server yet (missing SUPABASE_SECRET_KEY).", fields };
  }

  // Friendly duplicate checks (the database enforces both as unique too)
  const [byName, byPhone] = await Promise.all([
    service.from("profiles").select("id").eq("username", username).maybeSingle(),
    service.from("profiles").select("id").eq("phone", phone!).maybeSingle(),
  ]);
  if (byName.data) return { error: "That username is taken. Try another one.", fields };
  if (byPhone.data) return { error: "That mobile number already has an account. Log in instead.", fields };

  // Created already confirmed: no email or SMS verification
  const email = loginEmailFor(username);
  const { error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username, phone, full_name: username },
  });
  if (error) {
    return { error: /already|exists|duplicate/i.test(error.message) ? "That username or mobile number is already registered." : error.message, fields };
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) return { message: "Account created! Please log in.", fields };
  redirect(safeNext(String(form.get("next") ?? ""), "/menu"));
}

export async function updatePassword(_: AuthState, form: FormData): Promise<AuthState> {
  const password = String(form.get("password") ?? "");
  if (password.length < 8) return { error: "Use at least 8 characters." };
  if (password !== String(form.get("confirm") ?? "")) return { error: "Passwords do not match." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: /session/i.test(error.message) ? "Please log in first to change your password." : error.message };
  return { message: "Your password was updated." };
}
