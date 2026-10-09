import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createDb, createUser, key, one, productId, rpc, type Db } from "./harness";

let db: Db;
let admin: string, staff: string, staffPlus: string, alice: string, bob: string;
let toc: string, dawg: string, juice: string, egg: string, chick: string;

const stock = async (sku: string) =>
  Number((await one<{ s: string }>(db, `select current_stock s from inventory_items where sku = $1`, [sku])).s);
const balance = async (id: string) =>
  (await one<{ b: number }>(db, `select points_balance b from profiles where id = $1`, [id])).b;

const PLACE = `select public.place_online_order($1::jsonb, $2::service_type, $3, $4, $5, $6, $7, $8)`;
const POS = `select public.pos_create_order($1::jsonb, $2::service_type, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`;

type PosOpts = {
  items: unknown[];
  service?: "dine_in" | "takeout";
  method?: string;
  tendered?: number | null;
  reference?: string | null;
  customer?: string | null;
  redemption?: string | null;
  discount?: { type: string; value: number; reason: string } | null;
  grant?: string | null;
  complete?: boolean;
  key?: string;
};
const pos = (user: string, o: PosOpts) =>
  rpc<{ order_id: string; order_number: string; total: string; change: string; replayed: boolean }>(db, user, POS, [
    JSON.stringify(o.items), o.service ?? "dine_in", o.method ?? "cash", o.tendered ?? 1000, o.reference ?? null,
    o.customer ?? null, null, null, o.redemption ?? null, o.discount?.type ?? null, o.discount?.value ?? null,
    o.discount?.reason ?? null, o.grant ?? null, o.complete ?? false, null, o.key ?? key(),
  ]);

const setStatus = (user: string, orderId: string, status: string, note: string | null = null, grant: string | null = null) =>
  rpc(db, user, `select public.update_order_status($1, $2::order_status, $3, $4)`, [orderId, status, note, grant]);

beforeAll(async () => {
  db = await createDb();
  admin = await createUser(db, { name: "Ate Admin", role: "admin" });
  staff = await createUser(db, { name: "Kuya Cashier", role: "staff" });
  staffPlus = await createUser(db, { name: "Senior Cashier", role: "staff", permissions: ["apply_discount", "view_sales"] });
  alice = await createUser(db, { name: "Alice Student" });
  bob = await createUser(db, { name: "Bob Student" });
  [toc, dawg, juice, egg, , chick] = await Promise.all(
    ["java-toc", "java-dawg", "calamansi-juice", "fried-egg", "extra-java-rice", "java-chick"].map((s) => productId(db, s)),
  );
}, 60_000);

describe("online ordering", () => {
  let orderId: string;

  it("prices the cart from the database and adds the takeout packaging fee", async () => {
    const res = await rpc<{ order_id: string; order_number: string; total: string }>(db, alice, PLACE, [
      JSON.stringify([
        { product_id: toc, quantity: 3, price: 1 /* ignored */ },
        { product_id: dawg, quantity: 1, addons: [egg] },
        { product_id: juice, quantity: 1 },
      ]),
      "takeout", "cash", null, "less rice", null, null, key(),
    ]);
    orderId = res.order_id;
    expect(res.order_number).toMatch(/^JK-\d{6}-\d{4}$/);
    // 3×70 + 60 + 15 (egg) + 25 = 310, + ₱5 packaging
    expect(Number(res.total)).toBe(315);
    const o = await one<{ status: string; payment_status: string }>(db, `select * from orders where id = $1`, [orderId]);
    expect(o.status).toBe("pending");
    expect(o.payment_status).toBe("unpaid");
  });

  it("snapshots points per unit: ₱70 = 2, ₱60 = 1, add-ons and drinks = 0", async () => {
    const rows = await db.query<{ product_name: string; points_per_unit: number; points_eligible: boolean }>(
      `select product_name, points_per_unit, points_eligible from order_items where order_id = $1 order by product_name`,
      [orderId],
    );
    const map = Object.fromEntries(rows.rows.map((r) => [r.product_name, r.points_per_unit]));
    expect(map).toEqual({ "Calamansi Juice": 0, "Fried Egg": 0, "Java Dawg": 1, "Java Toc": 2 });
  });

  it("rejects add-ons that are not allowed and archived products", async () => {
    await expect(
      rpc(db, alice, PLACE, [JSON.stringify([{ product_id: juice, quantity: 1, addons: [egg] }]), "dine_in", "cash", null, null, null, null, key()]),
    ).rejects.toThrow(/add-on is not available/);
    await db.query(`update products set is_archived = true where id = $1`, [chick]);
    await expect(
      rpc(db, alice, PLACE, [JSON.stringify([{ product_id: chick, quantity: 1 }]), "dine_in", "cash", null, null, null, null, key()]),
    ).rejects.toThrow(/no longer on the menu/);
    await db.query(`update products set is_archived = false where id = $1`, [chick]);
  });

  it("returns the same order for a repeated request key", async () => {
    const k = key();
    const args = [JSON.stringify([{ product_id: dawg, quantity: 1 }]), "dine_in", "cash", null, null, null, null, k];
    const a = await rpc<{ order_id: string }>(db, bob, PLACE, args);
    const b = await rpc<{ order_id: string }>(db, bob, PLACE, args);
    expect(a.order_id).toBe(b.order_id);
    await rpc(db, bob, `select public.cancel_my_order($1, 'changed my mind')`, [a.order_id]);
  });

  it("requires GCash reference and never marks digital payments as paid", async () => {
    await expect(
      rpc(db, bob, PLACE, [JSON.stringify([{ product_id: dawg, quantity: 1 }]), "dine_in", "gcash", "", null, null, null, key()]),
    ).rejects.toThrow(/reference number/);
    const r = await rpc<{ order_id: string }>(db, bob, PLACE, [
      JSON.stringify([{ product_id: dawg, quantity: 1 }]), "dine_in", "gcash", "1234567890123", null, null, null, key(),
    ]);
    const o = await one<{ payment_status: string }>(db, `select payment_status from orders where id = $1`, [r.order_id]);
    expect(o.payment_status).toBe("pending_verification");
    const pay = await one<{ id: string }>(db, `select id from payments where order_id = $1`, [r.order_id]);
    await expect(rpc(db, bob, `select public.verify_payment($1, true, null)`, [pay.id])).rejects.toThrow(/permission denied|Staff access/);
    await rpc(db, staff, `select public.verify_payment($1, true, 'checked app')`, [pay.id]);
    const o2 = await one<{ payment_status: string }>(db, `select payment_status from orders where id = $1`, [r.order_id]);
    expect(o2.payment_status).toBe("paid");
  });

  it("will not complete an unpaid order", async () => {
    await setStatus(staff, orderId, "confirmed");
    await setStatus(staff, orderId, "preparing");
    await setStatus(staff, orderId, "ready");
    await expect(setStatus(staff, orderId, "completed")).rejects.toThrow(/Record the payment/);
  });

  it("completes once: deducts stock and awards points exactly once", async () => {
    const hotdogBefore = await stock("HOTD-01");
    const tocinoBefore = await stock("TOCI-01");
    const containersBefore = await stock("CONT-01");
    const pay = await rpc<{ change: string }>(db, staff, `select public.record_order_payment($1, 'cash', 500, null)`, [orderId]);
    expect(Number(pay.change)).toBe(185);
    await setStatus(staff, orderId, "completed");
    await setStatus(staff, orderId, "completed"); // retried request
    await rpc(db, null, `select 1`);
    await db.query(`select public.award_order_points($1)`, [orderId]); // a stray second award
    await db.query(`select public.deduct_order_inventory($1)`, [orderId]); // a stray second deduction

    expect(await balance(alice)).toBe(7); // 3 × 2 + 1 × 1
    const tk = await one<{ t: number }>(db, `select game_tokens t from profiles where id = $1`, [alice]);
    expect(tk.t).toBe(7); // same rule: ₱70 meals = 2 tokens, ₱60 = 1
    const ledger = await db.query(`select * from loyalty_ledger where order_id = $1`, [orderId]);
    expect(ledger.rows).toHaveLength(1);
    expect(await stock("HOTD-01")).toBeCloseTo(hotdogBefore - 1, 4);
    expect(await stock("TOCI-01")).toBeCloseTo(tocinoBefore - 0.27, 4); // 3 × 90 g
    expect(await stock("CONT-01")).toBeCloseTo(containersBefore - 4, 4); // takeout kit on 4 meals
    const o = await one<{ unit_cost: string }>(
      db, `select unit_cost from order_items where order_id = $1 and product_name = 'Java Toc'`, [orderId]);
    expect(Number(o.unit_cost)).toBeGreaterThan(40);
  });

  it("partially refunds: proportional amount, points reversed, optional restock", async () => {
    const tocItem = await one<{ id: string }>(db, `select id from order_items where order_id = $1 and product_name = 'Java Toc'`, [orderId]);
    await expect(
      rpc(db, staff, `select public.refund_order($1, $2::jsonb, 'cold food', true, null)`, [
        orderId, JSON.stringify([{ order_item_id: tocItem.id, quantity: 1 }])]),
    ).rejects.toThrow(/AUTH_REQUIRED/);
    const res = await rpc<{ amount: string; points_reversed: number }>(
      db, admin, `select public.refund_order($1, $2::jsonb, 'cold food', true, null)`,
      [orderId, JSON.stringify([{ order_item_id: tocItem.id, quantity: 1 }])],
    );
    expect(Number(res.amount)).toBe(70);
    expect(res.points_reversed).toBe(2);
    expect(await balance(alice)).toBe(5);
    const tk = await one<{ t: number }>(db, `select game_tokens t from profiles where id = $1`, [alice]);
    expect(tk.t).toBe(5); // refunded ₱70 meal takes back 2 tokens
    await expect(
      rpc(db, admin, `select public.refund_order($1, $2::jsonb, 'again', false, null)`, [
        orderId, JSON.stringify([{ order_item_id: tocItem.id, quantity: 3 }])]),
    ).rejects.toThrow(/Invalid refund quantity/);
    const o = await one<{ payment_status: string; refunded_total: string }>(db, `select * from orders where id = $1`, [orderId]);
    expect(o.payment_status).toBe("partially_refunded");
    expect(Number(o.refunded_total)).toBe(70);
  });
});

describe("row level security", () => {
  it("customers only see their own orders and cannot write orders directly", async () => {
    const mine = await asUser(db, bob, (tx) => tx.query(`select customer_id from orders`));
    expect((mine.rows as { customer_id: string }[]).every((r) => r.customer_id === bob)).toBe(true);
    const aliceOrders = await asUser(db, bob, (tx) => tx.query(`select * from orders where customer_id = $1`, [alice]));
    expect(aliceOrders.rows).toHaveLength(0);
    await expect(
      asUser(db, bob, (tx) => tx.query(`insert into orders (order_number, channel, service_type, subtotal, total, idempotency_key) values ('X', 'online', 'dine_in', 0, 0, 'abcdefgh1')`)),
    ).rejects.toThrow(/row-level security/);
    const ledger = await asUser(db, bob, (tx) => tx.query(`select * from loyalty_ledger where customer_id = $1`, [alice]));
    expect(ledger.rows).toHaveLength(0);
  });

  it("customers cannot promote themselves or edit points", async () => {
    await expect(asUser(db, bob, (tx) => tx.query(`update profiles set role = 'admin' where id = $1`, [bob]))).rejects.toThrow(/staff management/);
    await expect(asUser(db, bob, (tx) => tx.query(`update profiles set points_balance = 999 where id = $1`, [bob]))).rejects.toThrow(/cannot be edited/);
    await asUser(db, bob, (tx) => tx.query(`update profiles set full_name = 'Bobby' where id = $1`, [bob]));
    const res = await asUser(db, bob, (tx) => tx.query(`update profiles set full_name = 'hacked' where id = $1`, [alice]));
    expect(res.affectedRows).toBe(0);
  });

  it("hides recipes, costs and secrets from customers, staff and guests", async () => {
    for (const user of [null, bob, staff]) {
      const r = await asUser(db, user, (tx) => tx.query(`select * from recipes`));
      expect(r.rows).toHaveLength(0);
      const s = await asUser(db, user, (tx) => tx.query(`select * from game_session_secrets`));
      expect(s.rows).toHaveLength(0);
    }
    const guest = await asUser(db, null, (tx) => tx.query(`select count(*)::int c from products`));
    expect((guest.rows[0] as { c: number }).c).toBeGreaterThan(10);
    await expect(rpc(db, staff, `select * from public.product_costing()`)).rejects.toThrow(/Admin access/);
    await expect(rpc(db, bob, POS, [JSON.stringify([{ product_id: dawg, quantity: 1 }]), "dine_in", "cash", 100, null, null, null, null, null, null, null, null, null, false, null, key()])).rejects.toThrow(/permission denied|Staff access/);
  });
});

describe("POS", () => {
  it("calculates change and is idempotent on retries", async () => {
    const k = key();
    const a = await pos(staff, { items: [{ product_id: dawg, quantity: 2 }], tendered: 200, key: k, complete: true });
    const b = await pos(staff, { items: [{ product_id: dawg, quantity: 2 }], tendered: 200, key: k, complete: true });
    expect(Number(a.change)).toBe(80);
    expect(b.order_id).toBe(a.order_id);
    expect(b.replayed).toBe(true);
    const pays = await db.query(`select * from payments where order_id = $1`, [a.order_id]);
    expect(pays.rows).toHaveLength(1);
    await expect(pos(staff, { items: [{ product_id: dawg, quantity: 2 }], tendered: 100 })).rejects.toThrow(/less than the total/);
  });

  it("needs permission or a manager PIN for discounts, and the grant is single-use", async () => {
    const discount = { type: "percent", value: 10, reason: "suki" };
    await expect(pos(staff, { items: [{ product_id: toc, quantity: 1 }], discount })).rejects.toThrow(/AUTH_REQUIRED/);
    await rpc(db, admin, `select public.set_my_pin('2468')`);
    const bad = await rpc<{ ok: boolean }>(db, staff, `select public.request_override('apply_discount', '0000')`);
    expect(bad.ok).toBe(false);
    const good = await rpc<{ ok: boolean; grant_id: string }>(db, staff, `select public.request_override('apply_discount', '2468')`);
    expect(good.ok).toBe(true);
    const r = await pos(staff, { items: [{ product_id: toc, quantity: 1 }], discount, grant: good.grant_id });
    expect(Number(r.total)).toBe(63);
    await expect(pos(staff, { items: [{ product_id: toc, quantity: 1 }], discount, grant: good.grant_id })).rejects.toThrow(/AUTH_REQUIRED/);
    // Staff with permission, but above the 20% staff limit, needs an admin
    await expect(
      pos(staffPlus, { items: [{ product_id: toc, quantity: 1 }], discount: { type: "percent", value: 50, reason: "x" } }),
    ).rejects.toThrow(/AUTH_REQUIRED_ADMIN/);
    const adminGrant = await rpc<{ ok: boolean; grant_id: string }>(db, staffPlus, `select public.request_override('admin', '2468')`);
    const big = await pos(staffPlus, { items: [{ product_id: toc, quantity: 1 }], discount: { type: 'percent', value: 50, reason: 'promo' }, grant: adminGrant.grant_id });
    expect(Number(big.total)).toBe(35);
    const audit = await db.query(`select * from audit_logs where action like 'override.%'`);
    expect(audit.rows.length).toBeGreaterThanOrEqual(2);
  });

  it("voiding a paid order needs authorization and restocks", async () => {
    const before = await stock("HOTD-01");
    const r = await pos(staff, { items: [{ product_id: dawg, quantity: 1 }] });
    await setStatus(staff, r.order_id, "preparing");
    await expect(setStatus(staff, r.order_id, "cancelled", "wrong order")).rejects.toThrow(/AUTH_REQUIRED/);
    await setStatus(admin, r.order_id, "cancelled", "wrong order");
    const o = await one<{ status: string; payment_status: string }>(db, `select * from orders where id = $1`, [r.order_id]);
    expect(o).toMatchObject({ status: "cancelled", payment_status: "refunded" });
    expect(await stock("HOTD-01")).toBeCloseTo(before, 4); // default deduct stage = completed, so nothing moved
    const v = await one<{ kind: string }>(db, `select kind from refunds where order_id = $1`, [r.order_id]);
    expect(v.kind).toBe("void");
  });

  it("restocks a cancelled order when ingredients were deducted at preparing", async () => {
    await db.query(`update store_settings set inventory_deduct_stage = 'preparing'`);
    const before = await stock("HOTD-01");
    const r = await pos(staff, { items: [{ product_id: dawg, quantity: 2 }] });
    await setStatus(staff, r.order_id, "preparing");
    expect(await stock("HOTD-01")).toBeCloseTo(before - 2, 4);
    await setStatus(admin, r.order_id, "cancelled", "customer left");
    expect(await stock("HOTD-01")).toBeCloseTo(before, 4);
    await db.query(`update store_settings set inventory_deduct_stage = 'completed'`);
  });
});

describe("rewards", () => {
  it("redeems with enough points, applies the code once, and returns it if the order is cancelled", async () => {
    await db.query(`select public.add_ledger_entry($1, 50, 'admin_adjustment', 'test', 'test:alice')`, [alice]);
    const before = await balance(alice);
    const reward = await one<{ id: string; points_cost: number }>(db, `select id, points_cost from rewards where name = 'Free Calamansi Juice'`);
    const red = await rpc<{ code: string }>(db, alice, `select public.redeem_reward($1)`, [reward.id]);
    expect(red.code).toMatch(/^JK-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(await balance(alice)).toBe(before - reward.points_cost);

    await expect(rpc(db, bob, PLACE, [JSON.stringify([{ product_id: juice, quantity: 1 }]), "dine_in", "cash", null, null, null, red.code, key()]))
      .rejects.toThrow(/not found/);
    await expect(rpc(db, alice, PLACE, [JSON.stringify([{ product_id: dawg, quantity: 1 }]), "dine_in", "cash", null, null, null, red.code, key()]))
      .rejects.toThrow(/Add Calamansi Juice/);
    const o = await rpc<{ order_id: string; total: string }>(db, alice, PLACE, [
      JSON.stringify([{ product_id: dawg, quantity: 1 }, { product_id: juice, quantity: 1 }]), "dine_in", "cash", null, null, null, red.code, key()]);
    expect(Number(o.total)).toBe(60);
    await expect(rpc(db, alice, PLACE, [JSON.stringify([{ product_id: juice, quantity: 1 }]), "dine_in", "cash", null, null, null, red.code, key()]))
      .rejects.toThrow(/already used/);
    await rpc(db, alice, `select public.cancel_my_order($1, null)`, [o.order_id]);
    const status = await one<{ status: string }>(db, `select status from reward_redemptions where code = $1`, [red.code]);
    expect(status.status).toBe("issued");
    const looked = await rpc<{ status: string; customer_name: string }>(db, staff, `select public.lookup_redemption($1)`, [red.code.toLowerCase()]);
    expect(looked.status).toBe("issued");
  });

  it("refuses redemption without enough points", async () => {
    const reward = await one<{ id: string }>(db, `select id from rewards where name = 'Free Java Dawg'`);
    await expect(rpc(db, bob, `select public.redeem_reward($1)`, [reward.id])).rejects.toThrow(/more points/);
  });

  it("keeps the ledger append-only", async () => {
    await expect(db.query(`delete from loyalty_ledger`)).rejects.toThrow(/append-only/);
  });
});

describe("inventory", () => {
  it("receives purchases with weighted-average costing and unit conversion", async () => {
    const item = await one<{ id: string; current_stock: string; avg_cost: string }>(db, `select * from inventory_items where sku = 'RICE-01'`);
    const q0 = Number(item.current_stock), c0 = Number(item.avg_cost);
    const poId = await rpc<string>(db, admin, `select public.create_purchase_order(null, null, 'test', $1::jsonb, true)`, [
      JSON.stringify([{ inventory_item_id: item.id, quantity: 50000, unit: "g", unit_cost: 0.06 }]),
    ]);
    const after = await one<{ current_stock: string; avg_cost: string }>(db, `select * from inventory_items where sku = 'RICE-01'`);
    expect(Number(after.current_stock)).toBeCloseTo(q0 + 50, 4);
    expect(Number(after.avg_cost)).toBeCloseTo((q0 * c0 + 50 * 60) / (q0 + 50), 3);
    await expect(rpc(db, admin, `select public.receive_purchase_order($1)`, [poId])).rejects.toThrow(/already received/);
    await expect(asUser(db, admin, (tx) => tx.query(`update inventory_items set current_stock = 1 where sku = 'RICE-01'`))).rejects.toThrow(/only through/);
  });

  it("records spoilage and physical counts with notes", async () => {
    const item = await one<{ id: string }>(db, `select id from inventory_items where sku = 'EGGS-01'`);
    await expect(rpc(db, admin, `select public.record_stock_adjustment($1, 'spoilage', 6, null, '')`, [item.id])).rejects.toThrow(/note/);
    await rpc(db, admin, `select public.record_stock_adjustment($1, 'spoilage', 6, null, 'cracked tray')`, [item.id]);
    await rpc(db, admin, `select public.record_stock_adjustment($1, 'count', 200, null, 'weekly count')`, [item.id]);
    expect(await stock("EGGS-01")).toBe(200);
  });

  it("blocks recipe cycles", async () => {
    const rice = await one<{ id: string }>(db, `select id from recipes where name = 'Java Rice (1 serving)'`);
    const dawgRecipe = await one<{ id: string }>(db, `select r.id from recipes r join products p on p.id = r.product_id where p.slug = 'java-dawg'`);
    await expect(
      db.query(`insert into recipe_ingredients (recipe_id, sub_recipe_id, quantity) values ($1, $2, 1)`, [rice.id, dawgRecipe.id]),
    ).rejects.toThrow(/cannot include itself/);
  });
});

describe("reports", () => {
  it("summarises sales for admins and today-only for staff with view_sales", async () => {
    const today = (await one<{ d: string }>(db, `select public.manila_today()::text d`)).d;
    const s = await rpc<Record<string, number>>(db, admin, `select public.report_summary($1, $1)`, [today]);
    expect(Number(s.orders)).toBeGreaterThan(0);
    expect(Number(s.net_sales)).toBeCloseTo(Number(s.gross_sales) - Number(s.discounts) - Number(s.refunds), 2);
    expect(Number(s.gross_profit)).toBeCloseTo(Number(s.net_sales) - Number(s.cogs), 2);
    await expect(rpc(db, staff, `select public.report_summary($1, $1)`, [today])).rejects.toThrow(/access/);
    await rpc(db, staffPlus, `select public.staff_today_summary()`);
    await expect(rpc(db, staffPlus, `select public.report_summary('2020-01-01', $1)`, [today])).rejects.toThrow(/access/);
    const daily = await asUser(db, admin, (tx) => tx.query(`select * from public.report_daily_sales($1::date - 6, $1::date)`, [today]));
    expect(daily.rows).toHaveLength(7);
    const products = await asUser(db, admin, (tx) => tx.query(`select * from public.report_product_sales($1, $1)`, [today]));
    expect(products.rows.length).toBeGreaterThan(0);
    await asUser(db, admin, (tx) => tx.query(`select * from public.report_ingredient_usage($1, $1)`, [today]));
    await asUser(db, admin, (tx) => tx.query(`select * from public.report_staff_summary($1, $1)`, [today]));
    await rpc(db, admin, `select public.report_loyalty($1, $1)`, [today]);
    await rpc(db, admin, `select public.inventory_overview()`);
  });
});

describe("quotes", () => {
  it("prices a cart without creating anything", async () => {
    const before = await one<{ c: number }>(db, `select count(*)::int c from orders`);
    const q = await rpc<{ ok: boolean; total: string; points: number; lines: unknown[] }>(
      db, bob, `select public.quote_order('online', $1::jsonb, 'takeout', 'cash', 'BARKADA25', null)`,
      [JSON.stringify([{ product_id: toc, quantity: 5 }])],
    );
    expect(q.ok).toBe(true);
    expect(Number(q.total)).toBe(350 + 5 - 25);
    expect(q.points).toBe(10);
    const bad = await rpc<{ ok: boolean; error: string }>(
      db, bob, `select public.quote_order('online', $1::jsonb, 'takeout', 'cash', 'BARKADA25', null)`,
      [JSON.stringify([{ product_id: toc, quantity: 1 }])],
    );
    expect(bad).toMatchObject({ ok: false });
    expect(bad.error).toMatch(/minimum order/);
    const after = await one<{ c: number }>(db, `select count(*)::int c from orders`);
    expect(after.c).toBe(before.c);
    await expect(rpc(db, bob, `select public.quote_order('pos', $1::jsonb, 'takeout', 'cash', null, null)`, [JSON.stringify([{ product_id: toc, quantity: 1 }])]))
      .rejects.toThrow(/Staff access/);
  });
});

describe("cost visibility", () => {
  it("only admins can read recipe costs", async () => {
    await expect(rpc(db, bob, `select count(*) from public.admin_recipe_costs()`)).rejects.toThrow(/Admin access|permission denied/);
    await expect(rpc(db, bob, `select public.recipe_unit_cost(gen_random_uuid(), 'dine_in')`)).rejects.toThrow(/permission denied/);
    const n = await rpc<number>(db, admin, `select count(*)::int from public.admin_recipe_costs()`);
    expect(n).toBeGreaterThan(10);
  });
});

describe("cost snapshots stay internal", () => {
  it("customers can read their items but not unit_cost", async () => {
    const own = await asUser(db, alice, (tx) => tx.query(`select id, product_name, unit_price from order_items limit 1`));
    expect(own.rows.length).toBe(1);
    await expect(asUser(db, alice, (tx) => tx.query(`select unit_cost from order_items`))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, alice, (tx) => tx.query(`select * from order_items`))).rejects.toThrow(/permission denied/);
    const orderId = (own.rows[0] as { id: string }).id;
    await expect(rpc(db, alice, `select count(*) from public.admin_order_item_costs($1)`, [orderId])).rejects.toThrow(/Admin access/);
  });
});

describe("username accounts", () => {
  it("creates the profile from sign-up metadata and keeps usernames and numbers unique", async () => {
    const id = "11111111-2222-4333-8444-555555555555";
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'juan.dc@kainansakubo.app', $2)`, [
      id, JSON.stringify({ username: "Juan.DC", phone: "09171234567", full_name: "juan.dc" })]);
    const p = await one<{ username: string; phone: string; full_name: string }>(db, `select username, phone, full_name from profiles where id = $1`, [id]);
    expect(p).toMatchObject({ username: "juan.dc", phone: "09171234567", full_name: "juan.dc" });
    await expect(db.query(`insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'x@kainansakubo.app', $1)`, [
      JSON.stringify({ username: "other", phone: "09171234567" })])).rejects.toThrow(/duplicate|unique/);
    await expect(db.query(`insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'y@kainansakubo.app', $1)`, [
      JSON.stringify({ username: "juan.dc", phone: "09179999999" })])).rejects.toThrow(/duplicate|unique/);
    await expect(asUser(db, id, (tx) => tx.query(`update profiles set username = 'admin' where id = $1`, [id]))).rejects.toThrow(/cannot be edited/);
    await asUser(db, id, (tx) => tx.query(`update profiles set full_name = 'Juan Dela Cruz', phone = '09170000000' where id = $1`, [id]));
  });
});
