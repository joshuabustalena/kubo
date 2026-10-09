export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; auth?: "manager" | "admin"; cooldown?: number };

/**
 * Turns a Postgres/Supabase error into a message that is safe and useful to
 * show. Database functions raise human-readable messages; a few carry a
 * machine prefix (AUTH_REQUIRED, COOLDOWN) that the UI reacts to.
 */
export function toFailure(error: unknown): { ok: false; error: string; auth?: "manager" | "admin"; cooldown?: number } {
  const raw =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error
        ? String((error as { message: unknown }).message)
        : "Something went wrong.";

  if (raw.startsWith("AUTH_REQUIRED_ADMIN:")) {
    return { ok: false, error: raw.replace("AUTH_REQUIRED_ADMIN:", "").trim(), auth: "admin" };
  }
  if (raw.startsWith("NO_TOKENS:")) {
    return { ok: false, error: raw.replace("NO_TOKENS:", "").trim() };
  }
  if (raw.startsWith("AUTH_REQUIRED:")) {
    return { ok: false, error: raw.replace("AUTH_REQUIRED:", "").trim(), auth: "manager" };
  }
  const cooldown = raw.match(/^COOLDOWN:(\d+):([\s\S]*)$/);
  if (cooldown) {
    return { ok: false, error: cooldown[2].trim(), cooldown: Number(cooldown[1]) };
  }
  if (/permission denied|row-level security/i.test(raw)) {
    return { ok: false, error: "You don't have access to do that." };
  }
  if (/duplicate key value/i.test(raw)) {
    return { ok: false, error: "That already exists. Please use a different name or code." };
  }
  if (/violates foreign key constraint/i.test(raw)) {
    return { ok: false, error: "This record is still in use, so it can't be removed. Archive it instead." };
  }
  if (/violates check constraint/i.test(raw)) {
    return { ok: false, error: "Some values are out of range. Please check the form." };
  }
  if (/fetch failed|network/i.test(raw)) {
    return { ok: false, error: "We couldn't reach the server. Check your connection and try again." };
  }
  return { ok: false, error: raw.length > 300 ? "Something went wrong." : raw };
}

export function ok<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}
