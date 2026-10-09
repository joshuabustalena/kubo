import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

/** The signed-in user's profile, verified against Supabase Auth (once per request). */
export const getCurrentUser = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) return null;
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (!profile || !profile.is_active) return null;
  return profile as Profile;
});

export async function requireUser(next = "/account"): Promise<Profile> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

/** Staff or admin. Database functions re-check this on every call. */
export async function requireStaff(next = "/pos"): Promise<Profile> {
  const user = await requireUser(next);
  if (user.role !== "staff" && user.role !== "admin") redirect("/?denied=staff");
  return user;
}

export async function requireAdmin(next = "/admin"): Promise<Profile> {
  const user = await requireUser(next);
  if (user.role !== "admin") redirect(user.role === "staff" ? "/pos?denied=admin" : "/?denied=admin");
  return user;
}

export function hasPermission(user: Profile, permission: string): boolean {
  return user.role === "admin" || (user.role === "staff" && user.permissions.includes(permission as never));
}

/** Only allow same-site relative redirects after login. */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
