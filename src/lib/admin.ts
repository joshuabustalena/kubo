import "server-only";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Supabase client for admin server actions, or null when the caller is not an
 * admin. RLS and the database functions enforce the same rule again.
 */
export async function adminClient() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return null;
  return { supabase: await createClient(), user };
}

export const notAdmin = { ok: false as const, error: "Admin access required." };

/** Reads a FormData field as trimmed text. */
export function text(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

export function bool(form: FormData, key: string): boolean {
  const v = form.get(key);
  return v === "on" || v === "true" || v === "1";
}

/** Parses ?from=YYYY-MM-DD&to=YYYY-MM-DD with sane defaults (Asia/Manila). */
export function dateRange(sp: Record<string, string | string[] | undefined>, defaultDays = 30): { from: string; to: string } {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  const to = typeof sp.to === "string" && iso.test(sp.to) ? sp.to : today;
  let from: string;
  if (typeof sp.from === "string" && iso.test(sp.from)) {
    from = sp.from;
  } else {
    const d = new Date(`${to}T12:00:00+08:00`);
    d.setUTCDate(d.getUTCDate() - (defaultDays - 1));
    from = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(d);
  }
  return from <= to ? { from, to } : { from: to, to: from };
}
