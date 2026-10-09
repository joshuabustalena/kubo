/**
 * DEMO DATA — for a development/staging Supabase project only.
 *
 *   npm run seed:demo -- --yes [--days 14]
 *
 * Creates demo accounts (a cashier and six students) and then rings up real
 * orders through the same database functions the app uses (POS sales and
 * online orders → confirm → pay → complete), so stock, costs and points move
 * exactly as they would in the shop. Afterwards each order is back-dated to a
 * day in the last N days and flagged is_demo = true; the admin dashboard
 * shows a banner while demo orders exist.
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and
 * SUPABASE_SECRET_KEY in .env.local, and the catalogue seed (supabase/seed.sql).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // file missing: rely on the other file or the real environment
  }
}

const args = process.argv.slice(2);
if (!args.includes("--yes")) {
  console.error("This writes demo orders, payments and stock movements. Run only on a development project:\n  npm run seed:demo -- --yes");
  process.exit(1);
}
const DAYS = Math.min(60, Math.max(1, Number(args[args.indexOf("--days") + 1]) || 14));
const PASSWORD = "JavaKuboDemo#2026";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!;
const serviceKey = (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)!;
if (!url || !anonKey || !serviceKey) {
  console.error("Missing Supabase environment variables (see .env.example).");
  process.exit(1);
}
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const STUDENTS = [
  ["Bea Santos", "bea"], ["Carlo Reyes", "carlo"], ["Dani Cruz", "dani"],
  ["Enzo Garcia", "enzo"], ["Faye Mendoza", "faye"], ["Gab Villanueva", "gab"],
] as const;

async function ensureUser(email: string, fullName: string, role: "staff" | "customer") {
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: fullName } });
  let id = created.data.user?.id;
  if (!id) {
    const { data } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
    id = data?.id;
  }
  if (!id) throw new Error(`Could not create ${email}: ${created.error?.message}`);
  if (role === "staff") await admin.from("profiles").update({ role: "staff", permissions: ["view_sales"] }).eq("id", id);
  return id;
}

async function signIn(email: string): Promise<SupabaseClient> {
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  return client;
}

const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];
const rand = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));

/** Moves an order and everything it created to a past Manila date/time. */
async function backdate(orderId: string, day: Date) {
  const iso = day.toISOString();
  const later = new Date(day.getTime() + rand(6, 18) * 60000).toISOString();
  await admin.from("orders").update({ created_at: iso, confirmed_at: iso, is_demo: true }).eq("id", orderId);
  await admin.from("order_status_history").update({ created_at: iso }).eq("order_id", orderId);
  await admin.from("payments").update({ created_at: iso, verified_at: iso }).eq("order_id", orderId);
  await admin.from("inventory_movements").update({ created_at: later }).eq("order_id", orderId);
  await admin.from("orders").update({ completed_at: later }).eq("id", orderId).eq("status", "completed");
}

async function main() {
  const { data: products } = await admin.from("products").select("id, slug, price, is_addon, points_eligible").eq("is_archived", false);
  const meals = (products ?? []).filter((p) => p.points_eligible);
  const drinks = (products ?? []).filter((p) => !p.points_eligible && !p.is_addon);
  const addons = (products ?? []).filter((p) => p.is_addon);
  if (!meals.length) throw new Error("No menu found — run supabase/seed.sql first.");

  console.log("Creating demo accounts…");
  await ensureUser("cashier@demo.javakubo.test", "Demo Cashier", "staff");
  const studentIds: string[] = [];
  for (const [name, handle] of STUDENTS) studentIds.push(await ensureUser(`${handle}@demo.javakubo.test`, name, "customer"));

  const cashier = await signIn("cashier@demo.javakubo.test");
  const students = await Promise.all(STUDENTS.map(([, h]) => signIn(`${h}@demo.javakubo.test`)));

  const basket = () => {
    const items: { product_id: string; quantity: number; addons: string[]; notes: string }[] = [];
    for (let i = 0; i < rand(1, 3); i++) {
      items.push({ product_id: pick(meals).id, quantity: rand(1, 2), addons: Math.random() < 0.25 ? [pick(addons).id] : [], notes: "" });
    }
    if (Math.random() < 0.2 && drinks.length) items.push({ product_id: pick(drinks).id, quantity: 1, addons: [], notes: "" });
    return items;
  };

  let made = 0;
  for (let d = DAYS - 1; d >= 0; d--) {
    const date = new Date(Date.now() - d * 86400000);
    const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(date);
    const count = rand(6, 14);
    for (let n = 0; n < count; n++) {
      const at = new Date(`${ymd}T${String(rand(10, 19)).padStart(2, "0")}:${String(rand(0, 59)).padStart(2, "0")}:00+08:00`);
      if (at.getTime() > Date.now()) continue;
      const service = Math.random() < 0.6 ? "dine_in" : "takeout";
      let orderId: string | undefined;

      if (Math.random() < 0.65) {
        // Walk-in at the POS, sometimes linked to a student account
        const studentIdx = Math.random() < 0.5 ? rand(0, studentIds.length - 1) : -1;
        const gcash = Math.random() < 0.3;
        const { data, error } = await cashier.rpc("pos_create_order", {
          p_items: basket(), p_service_type: service, p_payment_method: gcash ? "gcash" : "cash",
          p_amount_tendered: gcash ? null : 1000, p_payment_reference: gcash ? String(1000000000000 + rand(0, 9e11)) : "",
          p_customer_id: studentIdx >= 0 ? studentIds[studentIdx] : null, p_customer_name: "", p_promo_code: "", p_redemption_code: "",
          p_discount_type: null, p_discount_value: null, p_discount_reason: "", p_override_grant: null, p_complete_now: true,
          p_notes: "", p_idempotency_key: randomUUID(),
        });
        if (error) { console.warn(`POS order skipped: ${error.message}`); continue; }
        orderId = data.order_id;
      } else {
        // Online order by a student, then handled by the cashier
        const s = rand(0, students.length - 1);
        const { data, error } = await students[s].rpc("place_online_order", {
          p_items: basket(), p_service_type: service, p_payment_method: "cash", p_payment_reference: "",
          p_notes: "", p_promo_code: "", p_redemption_code: "", p_idempotency_key: randomUUID(),
        });
        if (error) { console.warn(`Online order skipped: ${error.message}`); continue; }
        orderId = data.order_id;
        const steps: [string, Record<string, unknown>][] = [
          ["update_order_status", { p_order_id: orderId, p_status: "confirmed", p_note: "", p_override_grant: null }],
          ["update_order_status", { p_order_id: orderId, p_status: "preparing", p_note: "", p_override_grant: null }],
          ["update_order_status", { p_order_id: orderId, p_status: "ready", p_note: "", p_override_grant: null }],
          ["record_order_payment", { p_order_id: orderId, p_method: "cash", p_amount_tendered: 1000, p_reference: "" }],
          ["update_order_status", { p_order_id: orderId, p_status: "completed", p_note: "", p_override_grant: null }],
        ];
        for (const [fn, a] of steps) {
          const { error: e } = await cashier.rpc(fn, a);
          if (e) { console.warn(`${fn}: ${e.message}`); break; }
        }
      }
      if (orderId) {
        await backdate(orderId, at);
        made++;
      }
    }
    process.stdout.write(`\r${made} demo orders…`);
  }

  console.log("\nAdding demo expenses…");
  const expenses = [];
  for (let w = 0; w < Math.ceil(DAYS / 7); w++) {
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date(Date.now() - w * 7 * 86400000));
    expenses.push(
      { expense_date: day, category: "labor", description: "Weekly wages — 2 crew (demo)", amount: 7000, is_demo: true },
      { expense_date: day, category: "utilities", description: "LPG refill and electricity share (demo)", amount: 1350, is_demo: true },
    );
  }
  expenses.push({ expense_date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date()), category: "rent", description: "Monthly kubo stall rent (demo)", amount: 8000, is_demo: true });
  await admin.from("operating_expenses").insert(expenses);

  console.log(`✓ Done: ${made} demo orders over ${DAYS} days.`);
  console.log(`Demo logins (password ${PASSWORD}): cashier@demo.javakubo.test, bea@demo.javakubo.test …`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
