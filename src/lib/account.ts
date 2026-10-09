/**
 * Username + mobile-number accounts. Supabase Auth still needs an email, so
 * each account gets a hidden internal address that never receives mail.
 */
export const LOGIN_EMAIL_DOMAIN = "kainansakubo.app";

export const USERNAME_RULE = /^[a-z0-9_.]{3,20}$/;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@/, "");
}

export function loginEmailFor(username: string): string {
  return `${normalizeUsername(username)}@${LOGIN_EMAIL_DOMAIN}`;
}

/** True for the hidden address created for username accounts. */
export function isInternalEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${LOGIN_EMAIL_DOMAIN}`);
}

/**
 * Philippine mobile numbers → 09XXXXXXXXX. Accepts 0917…, 917…, +63917…,
 * 63917…, with spaces or dashes. Returns null if it isn't a PH mobile number.
 */
export function normalizePhone(raw: string): string | null {
  let d = raw.replace(/[^\d]/g, "");
  if (d.startsWith("63") && d.length === 12) d = `0${d.slice(2)}`;
  if (d.startsWith("9") && d.length === 10) d = `0${d}`;
  return /^09\d{9}$/.test(d) ? d : null;
}

/** 09171234567 → 0917 123 4567 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  return /^09\d{9}$/.test(phone) ? `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}` : phone;
}
