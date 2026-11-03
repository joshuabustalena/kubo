import { expect, it } from "vitest";
import { createDb, createUser, one, productId, rpc } from "./harness";

it("menu rewards: one per item, price ÷ 5, follows the menu, and makes the item free", async () => {
  const db = await createDb();
  const count = async (sql: string, p: unknown[] = []) => (await one<{ c: number }>(db, sql, p)).c;
  // every non-archived item has exactly one free-item reward with ceil(price / 5) points
  expect(await count(`select count(*)::int c from products p where not is_archived and not exists (select 1 from rewards r where r.product_id = p.id and r.reward_type = 'free_product')`)).toBe(0);
  expect(await count(`select count(*)::int c from rewards r join products p on p.id = r.product_id where r.follows_menu_price and r.points_cost <> ceil(p.price / 5)`)).toBe(0);
  const toc = await productId(db, "java-toc");
  const pts = async () => (await one<{ points_cost: number; is_active: boolean; name: string }>(db, `select points_cost, is_active, name from rewards where product_id = $1 and follows_menu_price`, [toc]));
  expect((await pts()).points_cost).toBe(14); // ₱70

  // price and name changes flow through; archiving hides it; un-archiving brings it back
  await db.query(`update products set price = 73, name = 'Java Toc Special' where id = $1`, [toc]);
  expect(await pts()).toMatchObject({ points_cost: 15, name: "Free Java Toc Special", is_active: true });
  await db.query(`update products set is_archived = true where id = $1`, [toc]);
  expect((await pts()).is_active).toBe(false);
  await db.query(`update products set is_archived = false, price = 70, name = 'Java Toc' where id = $1`, [toc]);
  expect(await pts()).toMatchObject({ points_cost: 14, is_active: true });

  // a brand-new item gets its reward automatically
  await db.query(`insert into products (category_id, name, slug, price) select category_id, 'Test Wings', 'test-wings', 99 from products where id = $1`, [toc]);
  expect((await one<{ points_cost: number }>(db, `select points_cost from rewards where product_id = (select id from products where slug = 'test-wings')`)).points_cost).toBe(20);

  // a hand-set reward keeps its own points
  const dawg = await productId(db, "java-dawg");
  await db.query(`update rewards set follows_menu_price = false, points_cost = 5 where product_id = $1`, [dawg]);
  await db.query(`update products set price = 99 where id = $1`, [dawg]);
  expect((await one<{ points_cost: number }>(db, `select points_cost from rewards where product_id = $1`, [dawg])).points_cost).toBe(5);

  // end to end: redeem with points, then the code makes that item free on an order
  const cust = await createUser(db, { name: "Reward Customer" });
  await db.query(`select public.add_ledger_entry($1, 20, 'admin_adjustment', 'test', $2, null, null, null)`, [cust, `t:${cust}`]);
  const rw = await one<{ id: string }>(db, `select id from rewards where product_id = $1`, [toc]);
  const red = await rpc<{ code: string }>(db, cust, `select public.redeem_reward($1)`, [rw.id]);
  expect((await one<{ points_balance: number }>(db, `select points_balance from profiles where id = $1`, [cust])).points_balance).toBe(6);
  const q = await rpc<{ ok: boolean; subtotal: string; discount_total: string; total: string }>(
    db, cust, `select public.quote_order('online', $1::jsonb, 'dine_in', 'cash', null, $2)`,
    [JSON.stringify([{ product_id: toc, quantity: 1 }]), red.code],
  );
  expect(q.ok).toBe(true);
  expect(Number(q.discount_total)).toBe(70);
  expect(Number(q.total)).toBe(0);
}, 60_000);
