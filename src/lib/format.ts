export const TIMEZONE = "Asia/Manila";

const pesoFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** ₱1,234.00 */
export function peso(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  return pesoFormatter.format(Number.isFinite(n) ? n : 0);
}

export function num(value: number | string | null | undefined, digits = 2): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  return new Intl.NumberFormat("en-PH", { maximumFractionDigits: digits }).format(Number.isFinite(n) ? n : 0);
}

export function percent(value: number | string | null | undefined, digits = 1): string {
  return `${num(value, digits)}%`;
}

export function dateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: TIMEZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function dateOnly(value: string | Date | null | undefined): string {
  if (!value) return "—";
  // Plain YYYY-MM-DD strings are calendar dates, not instants
  const d = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00+08:00`) : new Date(value);
  return new Intl.DateTimeFormat("en-PH", { timeZone: TIMEZONE, month: "short", day: "numeric", year: "numeric" }).format(d);
}

export function timeOnly(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-PH", { timeZone: TIMEZONE, hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

/** Today's date in Manila as YYYY-MM-DD */
export function manilaToday(): string {
  return manilaDate(new Date());
}

export function manilaDate(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return parts; // en-CA gives YYYY-MM-DD
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00+08:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return manilaDate(d);
}

export function relativeMinutes(value: string | Date): string {
  const mins = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ${mins % 60} min ago`;
  return dateTime(value);
}

export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready for Pickup",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  unpaid: "Unpaid",
  pending_verification: "Verifying payment",
  paid: "Paid",
  partially_refunded: "Partly refunded",
  refunded: "Refunded",
};

export const SERVICE_LABEL: Record<string, string> = { dine_in: "Dine-in", takeout: "Takeout" };

export const UNIT_LABEL: Record<string, string> = {
  kg: "kg",
  g: "g",
  l: "L",
  ml: "ml",
  pc: "pc",
  pack: "pack",
  bottle: "bottle",
};
