import { expect, it } from "vitest";
import { createDb, one } from "./harness";

it("inventory SKUs are generated, unique and permanent", async () => {
  const db = await createDb();
  const add = async (name: string, category: string) =>
    (await one<{ sku: string }>(db, `insert into inventory_items (name, category, unit) values ($1, $2, 'pc') returning sku`, [name, category])).sku;
  const a = await add("Chili flakes", "seasoning");
  const b = await add("Paper cup", "packaging");
  const c = await add("Mystery", "");
  expect(a).toMatch(/^SEA-\d{4}$/);
  expect(b).toMatch(/^PAC-\d{4}$/);
  expect(c).toMatch(/^INV-\d{4}$/);
  expect(new Set([a, b, c]).size).toBe(3);
  // can't be changed afterwards
  await db.query(`update inventory_items set sku = 'HACKED', name = 'Chili flakes (fine)' where sku = $1`, [a]);
  const row = await one<{ sku: string; name: string }>(db, `select sku, name from inventory_items where name = 'Chili flakes (fine)'`);
  expect(row.sku).toBe(a);
  // seeded items keep their codes
  expect((await one<{ c: number }>(db, `select count(*)::int c from inventory_items where sku = 'GPPR-01'`)).c).toBe(1);
}, 60_000);
