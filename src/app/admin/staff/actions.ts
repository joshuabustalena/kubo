"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { loginEmailFor, normalizePhone, normalizeUsername, USERNAME_RULE } from "@/lib/account";
import { adminClient, notAdmin } from "@/lib/admin";
import { ok, toFailure, type ActionResult } from "@/lib/errors";
import { createServiceClient } from "@/lib/supabase/admin";

const perms = z.array(z.enum(["apply_discount", "void_order", "refund_order", "view_sales"])).max(4);

const createSchema = z.object({
  full_name: z.string().trim().min(2, "Enter the staff member's name.").max(120),
  username: z.string().regex(USERNAME_RULE, "Username: 3–20 letters, numbers, dots or underscores."),
  phone: z.string(),
  password: z.string().min(8, "Temporary password must be at least 8 characters.").max(72),
  role: z.enum(["staff", "admin"]),
  permissions: perms,
});

/** Creates a staff/admin login. Uses the service key only after confirming the caller is an admin. */
export async function createStaff(raw: z.input<typeof createSchema>): Promise<ActionResult> {
  const ctx = await adminClient();
  if (!ctx) return notAdmin;
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const v = parsed.data;
  const username = normalizeUsername(v.username);
  const phone = v.phone.trim() ? normalizePhone(v.phone) : "";
  if (phone === null) return { ok: false, error: "Enter a valid mobile number, or leave it blank." };

  let service;
  try {
    service = createServiceClient();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const [byName, byPhone] = await Promise.all([
    service.from("profiles").select("id").eq("username", username).maybeSingle(),
    phone ? service.from("profiles").select("id").eq("phone", phone).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (byName.data) return { ok: false, error: "That username is taken." };
  if (byPhone.data) return { ok: false, error: "That mobile number already has an account. Find it above and change its role instead." };

  const { data, error } = await service.auth.admin.createUser({
    email: loginEmailFor(username),
    password: v.password,
    email_confirm: true,
    user_metadata: { full_name: v.full_name, username, phone },
  });
  if (error) return { ok: false, error: /already/i.test(error.message) ? "That username or mobile number is already registered. Find it below and change its role instead." : error.message };

  // Role change goes through the audited, admin-checked database function as the current admin
  const { error: accessErr } = await ctx.supabase.rpc("admin_set_user_access", {
    p_user_id: data.user.id, p_role: v.role, p_permissions: v.permissions, p_is_active: true,
  });
  if (accessErr) return toFailure(accessErr);
  revalidatePath("/admin/staff");
  return ok(undefined);
}

export async function setAccess(userId: string, role: "admin" | "staff" | "customer", permissions: string[], isActive: boolean): Promise<ActionResult> {
  const ctx = await adminClient();
  if (!ctx) return notAdmin;
  const p = perms.safeParse(permissions);
  if (!p.success) return { ok: false, error: "Invalid permissions." };
  const { error } = await ctx.supabase.rpc("admin_set_user_access", { p_user_id: userId, p_role: role, p_permissions: p.data, p_is_active: isActive });
  if (error) return toFailure(error);
  revalidatePath("/admin/staff");
  return ok(undefined);
}

/** Finds an account by username, mobile number or email. */
export async function findUserByEmail(email: string): Promise<ActionResult<{ id: string; full_name: string; email: string; username: string | null; role: string } | null>> {
  const ctx = await adminClient();
  if (!ctx) return notAdmin;
  const term = email.trim();
  const phone = normalizePhone(term);
  const q = ctx.supabase.from("profiles").select("id, full_name, email, username, role").limit(1);
  const { data, error } = term.includes("@") ? await q.ilike("email", term).maybeSingle() : phone ? await q.eq("phone", phone).maybeSingle() : await q.eq("username", normalizeUsername(term)).maybeSingle();
  if (error) return toFailure(error);
  return ok(data);
}
