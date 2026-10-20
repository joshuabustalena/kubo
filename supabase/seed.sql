-- =============================================================================
-- Kainan sa Kubo — catalogue seed (menu, ingredients, recipes, rewards, games)
--
-- Every row created here is flagged is_demo = true where the table supports it
-- so it is easy to tell sample catalogue data from data the owner enters.
-- This file creates NO orders, payments or points. Demo transactions are only
-- created by `npm run seed:demo`, which should be run on a development project.
-- Safe to run once on a fresh database (after the migrations).
-- =============================================================================

-- Store profile -------------------------------------------------------------
update public.store_settings set
  store_name = 'Kainan sa Kubo',
  tagline = 'Sulit Java Rice meals, kubo style.',
  about = 'Kainan sa Kubo started as a small bamboo kubo near campus serving garlicky, golden Java Rice meals that students can afford every day. Every meal comes on a black tray lined with greaseproof paper, with free drinks.',
  address = 'Zone 6, Camaya, Mariveles, Bataan',
  phone = '0909 864 4862',
  email = '',
  facebook_url = '',
  opening_hours = '[{"days":"Monday – Friday","hours":"6:00 AM – 10:00 PM"},{"days":"Saturday","hours":"10:00 AM – 8:00 PM"},{"days":"Sunday","hours":"Closed"}]'::jsonb,
  takeout_packaging_fee = 5
where id;

-- Payment methods -------------------------------------------------------------
insert into public.payment_methods (code, name, instructions, is_active, allow_online, allow_pos, is_cash, requires_reference, sort_order) values
  ('cash', 'Cash', 'Pay at the counter when you pick up your order.', true, true, true, true, false, 1),
  ('gcash', 'GCash', 'Send the exact total to 0917 555 0123 (Kainan sa Kubo) and enter the 13-digit reference number. Staff will verify it before preparing your order.', true, true, true, false, true, 2);

-- Categories ------------------------------------------------------------------
insert into public.categories (name, slug, description, sort_order, is_addon_category, is_demo) values
  ('Java Rice Meals', 'java-rice-meals', 'Our classic silog-style plates on golden Java Rice.', 1, false, true),
  ('Hotdog Meals', 'hotdog-meals', 'Jumbo hotdogs, sliced and fried just right.', 2, false, true),
  ('Chicken Meals', 'chicken-meals', 'Crispy chicken with our house gravy.', 3, false, true),
  ('Pork Meals', 'pork-meals', 'Liempo and porkchop, grilled and fried.', 4, false, true),
  ('Sisig Meals', 'sisig-meals', 'Sizzling sisig over Java Rice.', 5, false, true),
  ('Fish Meals', 'fish-meals', 'Daing na bangus and crispy fish fillet.', 6, false, true),
  ('Drinks and Add-ons', 'drinks-and-add-ons', 'Extra rice, gravy, fries and drinks.', 7, true, true);

-- Products --------------------------------------------------------------------
insert into public.products (category_id, name, slug, description, price, is_addon, points_eligible, is_featured, sort_order, is_demo)
select c.id, v.name, v.slug, v.description, v.price, v.is_addon, v.points_eligible, v.featured, v.sort_order, true
from (values
  ('java-rice-meals', 'Java Long', 'java-long', 'Sweet-garlic longganisa with Java Rice. Free drinks.', 65, false, true, true, 1),
  ('java-rice-meals', 'Java Toc', 'java-toc', 'Caramelized pork tocino with Java Rice. Free drinks.', 70, false, true, true, 2),
  ('hotdog-meals', 'Java Dawg', 'java-dawg', 'Jumbo red hotdog with Java Rice. Free drinks.', 60, false, true, true, 1),
  ('hotdog-meals', 'Cheesy Java Dawg', 'cheesy-java-dawg', 'Jumbo hotdog topped with melted cheese, with Java Rice. Free drinks.', 65, false, true, false, 2),
  ('chicken-meals', 'Java Chick', 'java-chick', 'Crispy fried chicken with house gravy and Java Rice. Free drinks.', 85, false, true, true, 1),
  ('chicken-meals', 'Java Chicken Pops', 'java-chicken-pops', 'Bite-size chicken pops with gravy and Java Rice. Free drinks.', 75, false, true, false, 2),
  ('pork-meals', 'Java Liempo', 'java-liempo', 'Grilled pork belly with Java Rice. Free drinks.', 95, false, true, true, 1),
  ('pork-meals', 'Java Porkchop', 'java-porkchop', 'Crispy fried porkchop with gravy and Java Rice. Free drinks.', 90, false, true, false, 2),
  ('sisig-meals', 'Java Sisig', 'java-sisig', 'Sizzling pork sisig with calamansi and Java Rice. Free drinks.', 80, false, true, true, 1),
  ('sisig-meals', 'Java Sisig Supreme', 'java-sisig-supreme', 'Pork sisig topped with egg and mayo, with Java Rice. Free drinks.', 95, false, true, false, 2),
  ('fish-meals', 'Java Bangus', 'java-bangus', 'Daing na bangus with atchara and Java Rice. Free drinks.', 90, false, true, false, 1),
  ('fish-meals', 'Java Fish Fillet', 'java-fish-fillet', 'Crispy fish fillet with tartar dip and Java Rice. Free drinks.', 75, false, true, false, 2),
  ('drinks-and-add-ons', 'Extra Java Rice', 'extra-java-rice', 'One more cup of garlicky Java Rice.', 20, true, false, false, 1),
  ('drinks-and-add-ons', 'Fried Egg', 'fried-egg', 'Sunny side up or well done, just ask.', 15, true, false, false, 2),
  ('drinks-and-add-ons', 'Extra Gravy', 'extra-gravy', 'A cup of our house gravy.', 10, true, false, false, 3),
  ('drinks-and-add-ons', 'Atchara', 'atchara', 'Pickled green papaya side.', 10, true, false, false, 4),
  ('drinks-and-add-ons', 'Calamansi Juice', 'calamansi-juice', 'Freshly squeezed, lightly sweet.', 25, false, false, false, 5),
  ('drinks-and-add-ons', 'Bottled Water', 'bottled-water', '500 ml bottled water.', 15, false, false, false, 6),
  ('drinks-and-add-ons', 'Iced Tea Refill', 'iced-tea-refill', 'One more cup of house iced tea.', 15, false, false, false, 7)
) as v(cat, name, slug, description, price, is_addon, points_eligible, featured, sort_order)
join public.categories c on c.slug = v.cat;

-- Every meal can take every add-on
insert into public.product_addons (product_id, addon_product_id)
select m.id, a.id from public.products m cross join public.products a
where not m.is_addon and m.points_eligible and a.is_addon;

-- Suppliers -------------------------------------------------------------------
insert into public.suppliers (name, contact_person, phone, email, address, notes, is_demo) values
  ('Mang Ramon Rice Trading', 'Ramon Dela Cruz', '0918 222 1111', '', 'Commonwealth Market', 'Delivers rice every Monday.', true),
  ('Cubao Meat Supply', 'Liza Santos', '0917 333 2222', 'orders@cubaomeat.example', 'Cubao, QC', 'Pork, chicken, hotdog and longganisa.', true),
  ('Navotas Fish Port Dealer', 'Jun Reyes', '0919 444 3333', '', 'Navotas Fish Port', 'Bangus and fish fillet.', true),
  ('Kusina Packaging Depot', 'Ana Lim', '0915 555 4444', 'sales@kusinapack.example', 'Divisoria, Manila', 'Containers, cups, greaseproof paper.', true),
  ('Puregold Wholesale', '', '', '', 'Puregold QC', 'Oil, condiments, powders, drinks.', true);

-- Inventory items (unit costs are per stock unit) -------------------------------
insert into public.inventory_items (sku, name, category, unit, min_stock, supplier_id, is_demo)
select v.sku, v.name, v.category, v.unit::public.stock_unit, v.min_stock, s.id, true
from (values
  ('RICE-01', 'Rice (well-milled)', 'ingredient', 'kg', 25, 'Mang Ramon Rice Trading'),
  ('GARL-01', 'Garlic (minced)', 'ingredient', 'kg', 1, 'Puregold Wholesale'),
  ('ANNA-01', 'Atsuete (annatto) powder', 'seasoning', 'g', 200, 'Puregold Wholesale'),
  ('MARG-01', 'Margarine', 'ingredient', 'g', 1000, 'Puregold Wholesale'),
  ('OIL-01', 'Cooking oil', 'oil', 'l', 4, 'Puregold Wholesale'),
  ('SEAS-01', 'Seasoning mix', 'seasoning', 'g', 300, 'Puregold Wholesale'),
  ('HOTD-01', 'Jumbo hotdog', 'protein', 'pc', 30, 'Cubao Meat Supply'),
  ('LONG-01', 'Longganisa', 'protein', 'pc', 60, 'Cubao Meat Supply'),
  ('TOCI-01', 'Pork tocino', 'protein', 'kg', 3, 'Cubao Meat Supply'),
  ('CHKN-01', 'Chicken cut (thigh/leg)', 'protein', 'pc', 30, 'Cubao Meat Supply'),
  ('CPOP-01', 'Chicken pops (boneless)', 'protein', 'kg', 2, 'Cubao Meat Supply'),
  ('LIEM-01', 'Pork liempo', 'protein', 'kg', 3, 'Cubao Meat Supply'),
  ('PCHP-01', 'Porkchop', 'protein', 'pc', 20, 'Cubao Meat Supply'),
  ('SISG-01', 'Sisig mix (pork)', 'protein', 'kg', 3, 'Cubao Meat Supply'),
  ('BANG-01', 'Daing na bangus (half)', 'protein', 'pc', 15, 'Navotas Fish Port Dealer'),
  ('FISH-01', 'Fish fillet (cream dory)', 'protein', 'kg', 2, 'Navotas Fish Port Dealer'),
  ('EGGS-01', 'Egg', 'ingredient', 'pc', 60, 'Puregold Wholesale'),
  ('BRED-01', 'Breading mix', 'ingredient', 'g', 1000, 'Puregold Wholesale'),
  ('GRAV-01', 'Gravy powder', 'gravy', 'g', 500, 'Puregold Wholesale'),
  ('CHSE-01', 'Cheese', 'ingredient', 'g', 300, 'Puregold Wholesale'),
  ('MAYO-01', 'Mayonnaise', 'ingredient', 'g', 500, 'Puregold Wholesale'),
  ('ONIO-01', 'Onion', 'ingredient', 'kg', 1, 'Puregold Wholesale'),
  ('CALA-01', 'Calamansi', 'ingredient', 'kg', 1, 'Puregold Wholesale'),
  ('ATCH-01', 'Atchara', 'ingredient', 'g', 1000, 'Puregold Wholesale'),
  ('ITEA-01', 'Iced tea powder', 'drink', 'g', 1000, 'Puregold Wholesale'),
  ('SUGR-01', 'Sugar', 'drink', 'kg', 2, 'Puregold Wholesale'),
  ('WATR-01', 'Bottled water 500 ml', 'drink', 'bottle', 24, 'Puregold Wholesale'),
  ('CUPS-01', 'Plastic cup with lid (16 oz)', 'packaging', 'pc', 100, 'Kusina Packaging Depot'),
  ('GPPR-01', 'Greaseproof paper sheet', 'packaging', 'pc', 200, 'Kusina Packaging Depot'),
  ('CONT-01', 'Takeout container', 'packaging', 'pc', 100, 'Kusina Packaging Depot'),
  ('UTEN-01', 'Spoon and fork set', 'packaging', 'pc', 100, 'Kusina Packaging Depot'),
  ('BAGS-01', 'Plastic bag (small)', 'packaging', 'pc', 100, 'Kusina Packaging Depot'),
  ('SAUC-01', 'Sauce cup with lid', 'packaging', 'pc', 100, 'Kusina Packaging Depot')
) as v(sku, name, category, unit, min_stock, supplier)
left join public.suppliers s on s.name = v.supplier;

-- Opening stock with purchase costs (creates auditable 'opening' movements)
do $$
declare r record;
begin
  for r in select i.id, v.qty, v.cost from (values
    ('RICE-01', 100, 52), ('GARL-01', 5, 160), ('ANNA-01', 1000, 0.8), ('MARG-01', 5000, 0.2),
    ('OIL-01', 18, 110), ('SEAS-01', 1000, 0.12), ('HOTD-01', 120, 14), ('LONG-01', 240, 6),
    ('TOCI-01', 10, 280), ('CHKN-01', 80, 32), ('CPOP-01', 6, 260), ('LIEM-01', 10, 360),
    ('PCHP-01', 60, 40), ('SISG-01', 10, 260), ('BANG-01', 40, 40), ('FISH-01', 6, 240),
    ('EGGS-01', 300, 7), ('BRED-01', 5000, 0.12), ('GRAV-01', 2000, 0.3), ('CHSE-01', 1000, 0.5),
    ('MAYO-01', 2000, 0.18), ('ONIO-01', 4, 140), ('CALA-01', 3, 100), ('ATCH-01', 3000, 0.12),
    ('ITEA-01', 5000, 0.25), ('SUGR-01', 10, 75), ('WATR-01', 96, 8), ('CUPS-01', 1000, 1.5),
    ('GPPR-01', 2000, 0.5), ('CONT-01', 500, 6), ('UTEN-01', 500, 1.5), ('BAGS-01', 500, 0.8),
    ('SAUC-01', 500, 0.8)
  ) as v(sku, qty, cost) join public.inventory_items i on i.sku = v.sku
  loop
    perform public.apply_stock_movement(r.id, 'opening', r.qty, r.cost, null, null, null, 'Opening stock (sample data)');
  end loop;
end $$;

-- Recipes -----------------------------------------------------------------------
-- Sub-recipes are reused by every meal: Java Rice, free iced tea, tray liner,
-- house gravy and the takeout kit (takeout orders only).
do $$
declare
  v_rice uuid; v_tea uuid; v_tray uuid; v_gravy uuid; v_kit uuid; v_egg uuid;
  function_item uuid;
  rec record;
  v_recipe uuid;

  -- helper to fetch an item id by SKU
begin
  insert into public.recipes (name, yield_servings, notes, is_demo)
  values ('Java Rice (1 serving)', 10, 'Batch of 10 cups. Uncooked rice weight; fried with garlic, atsuete and margarine.', true)
  returning id into v_rice;
  insert into public.recipe_ingredients (recipe_id, inventory_item_id, quantity, unit, cost_type, sort_order)
  select v_rice, i.id, v.qty, v.unit::public.stock_unit, v.ct::public.cost_type, v.so
  from (values ('RICE-01', 1.0, 'kg', 'ingredient', 1), ('GARL-01', 50, 'g', 'ingredient', 2),
               ('ANNA-01', 10, 'g', 'oil_seasoning', 3), ('MARG-01', 50, 'g', 'oil_seasoning', 4),
               ('OIL-01', 40, 'ml', 'oil_seasoning', 5), ('SEAS-01', 10, 'g', 'oil_seasoning', 6)) v(sku, qty, unit, ct, so)
  join public.inventory_items i on i.sku = v.sku;

  insert into public.recipes (name, yield_servings, notes, is_demo)
  values ('Free iced tea (1 cup)', 1, 'Included with every meal.', true) returning id into v_tea;
  insert into public.recipe_ingredients (recipe_id, inventory_item_id, quantity, unit, cost_type, sort_order)
  select v_tea, i.id, v.qty, v.unit::public.stock_unit, 'drink', v.so
  from (values ('ITEA-01', 10, 'g', 1), ('SUGR-01', 8, 'g', 2), ('CUPS-01', 1, 'pc', 3)) v(sku, qty, unit, so)
  join public.inventory_items i on i.sku = v.sku;

  insert into public.recipes (name, yield_servings, notes, is_demo)
  values ('Tray liner', 1, 'Greaseproof paper on the black tray (dine-in and takeout).', true) returning id into v_tray;
  insert into public.recipe_ingredients (recipe_id, inventory_item_id, quantity, unit, cost_type)
  select v_tray, id, 1, 'pc', 'packaging' from public.inventory_items where sku = 'GPPR-01';

  insert into public.recipes (name, yield_servings, notes, is_demo)
  values ('House gravy (1 cup)', 1, 'Gravy powder plus sauce cup.', true) returning id into v_gravy;
  insert into public.recipe_ingredients (recipe_id, inventory_item_id, quantity, unit, cost_type, sort_order)
  select v_gravy, i.id, v.qty, v.unit::public.stock_unit, v.ct::public.cost_type, v.so
  from (values ('GRAV-01', 10, 'g', 'gravy', 1), ('SAUC-01', 1, 'pc', 'packaging', 2)) v(sku, qty, unit, ct, so)
  join public.inventory_items i on i.sku = v.sku;

  insert into public.recipes (name, yield_servings, notes, is_demo)
  values ('Takeout kit', 1, 'Container, utensils and bag.', true) returning id into v_kit;
  insert into public.recipe_ingredients (recipe_id, inventory_item_id, quantity, unit, cost_type, sort_order)
  select v_kit, i.id, 1, 'pc', 'packaging', v.so
  from (values ('CONT-01', 1), ('UTEN-01', 2), ('BAGS-01', 3)) v(sku, so)
  join public.inventory_items i on i.sku = v.sku;

  insert into public.recipes (name, yield_servings, notes, is_demo)
  values ('Fried egg', 1, 'One egg fried in a little oil.', true) returning id into v_egg;
  insert into public.recipe_ingredients (recipe_id, inventory_item_id, quantity, unit, cost_type, sort_order)
  select v_egg, i.id, v.qty, v.unit::public.stock_unit, v.ct::public.cost_type, v.so
  from (values ('EGGS-01', 1, 'pc', 'ingredient', 1), ('OIL-01', 5, 'ml', 'oil_seasoning', 2)) v(sku, qty, unit, ct, so)
  join public.inventory_items i on i.sku = v.sku;

  -- Meal recipes: protein lines + shared sub-recipes
  for rec in select * from (values
    ('java-long',          '[["LONG-01",3,"pc"],["OIL-01",10,"ml"]]',                              true, false),
    ('java-toc',           '[["TOCI-01",90,"g"],["OIL-01",10,"ml"]]',                              true, false),
    ('java-dawg',          '[["HOTD-01",1,"pc"],["OIL-01",5,"ml"]]',                              true, false),
    ('cheesy-java-dawg',   '[["HOTD-01",1,"pc"],["CHSE-01",15,"g"],["OIL-01",5,"ml"]]',            true, false),
    ('java-chick',         '[["CHKN-01",1,"pc"],["BRED-01",30,"g"],["OIL-01",30,"ml"]]',            false, true),
    ('java-chicken-pops',  '[["CPOP-01",100,"g"],["BRED-01",25,"g"],["OIL-01",30,"ml"]]',           false, true),
    ('java-liempo',        '[["LIEM-01",130,"g"],["SEAS-01",3,"g"],["ATCH-01",30,"g"]]',            false, false),
    ('java-porkchop',      '[["PCHP-01",1,"pc"],["BRED-01",20,"g"],["OIL-01",30,"ml"]]',            false, true),
    ('java-sisig',         '[["SISG-01",110,"g"],["ONIO-01",20,"g"],["CALA-01",10,"g"],["OIL-01",10,"ml"]]', false, false),
    ('java-sisig-supreme', '[["SISG-01",120,"g"],["ONIO-01",20,"g"],["MAYO-01",10,"g"],["CALA-01",10,"g"],["OIL-01",10,"ml"]]', true, false),
    ('java-bangus',        '[["BANG-01",1,"pc"],["ATCH-01",30,"g"],["OIL-01",30,"ml"]]',            false, false),
    ('java-fish-fillet',   '[["FISH-01",100,"g"],["BRED-01",25,"g"],["MAYO-01",10,"g"],["OIL-01",30,"ml"]]', false, false)
  ) as t(slug, lines, with_egg, with_gravy)
  loop
    insert into public.recipes (name, product_id, yield_servings, is_demo)
    select p.name, p.id, 1, true from public.products p where p.slug = rec.slug
    returning id into v_recipe;

    insert into public.recipe_ingredients (recipe_id, inventory_item_id, quantity, unit, cost_type, sort_order)
    select v_recipe, i.id, (l ->> 1)::numeric, (l ->> 2)::public.stock_unit,
           case when i.sku = 'OIL-01' or i.sku = 'SEAS-01' then 'oil_seasoning' else 'ingredient' end::public.cost_type,
           ord::integer
      from jsonb_array_elements(rec.lines::jsonb) with ordinality x(l, ord)
      join public.inventory_items i on i.sku = l ->> 0;

    insert into public.recipe_ingredients (recipe_id, sub_recipe_id, quantity, cost_type, applies_to, sort_order) values
      (v_recipe, v_rice, 1, 'ingredient', 'all', 20),
      (v_recipe, v_tea, 1, 'drink', 'all', 30),
      (v_recipe, v_tray, 1, 'packaging', 'all', 40),
      (v_recipe, v_kit, 1, 'packaging', 'takeout', 50);
    if rec.with_egg then
      insert into public.recipe_ingredients (recipe_id, sub_recipe_id, quantity, cost_type, sort_order)
      values (v_recipe, v_egg, 1, 'ingredient', 10);
    end if;
    if rec.with_gravy then
      insert into public.recipe_ingredients (recipe_id, sub_recipe_id, quantity, cost_type, sort_order)
      values (v_recipe, v_gravy, 1, 'gravy', 15);
    end if;
  end loop;

  -- Add-ons and drinks
  insert into public.recipes (name, product_id, yield_servings, is_demo)
  select name, id, 1, true from public.products where slug = 'extra-java-rice' returning id into v_recipe;
  insert into public.recipe_ingredients (recipe_id, sub_recipe_id, quantity, cost_type) values (v_recipe, v_rice, 1, 'ingredient');

  insert into public.recipes (name, product_id, yield_servings, is_demo)
  select name, id, 1, true from public.products where slug = 'fried-egg' returning id into v_recipe;
  insert into public.recipe_ingredients (recipe_id, sub_recipe_id, quantity, cost_type) values (v_recipe, v_egg, 1, 'ingredient');

  insert into public.recipes (name, product_id, yield_servings, is_demo)
  select name, id, 1, true from public.products where slug = 'extra-gravy' returning id into v_recipe;
  insert into public.recipe_ingredients (recipe_id, sub_recipe_id, quantity, cost_type) values (v_recipe, v_gravy, 1, 'gravy');

  insert into public.recipes (name, product_id, yield_servings, is_demo)
  select name, id, 1, true from public.products where slug = 'atchara' returning id into v_recipe;
  insert into public.recipe_ingredients (recipe_id, inventory_item_id, quantity, unit, cost_type)
  select v_recipe, id, 40, 'g', 'ingredient' from public.inventory_items where sku = 'ATCH-01';

  insert into public.recipes (name, product_id, yield_servings, is_demo)
  select name, id, 1, true from public.products where slug = 'calamansi-juice' returning id into v_recipe;
  insert into public.recipe_ingredients (recipe_id, inventory_item_id, quantity, unit, cost_type, sort_order)
  select v_recipe, i.id, v.qty, v.unit::public.stock_unit, 'drink', v.so
  from (values ('CALA-01', 80, 'g', 1), ('SUGR-01', 20, 'g', 2), ('CUPS-01', 1, 'pc', 3)) v(sku, qty, unit, so)
  join public.inventory_items i on i.sku = v.sku;

  insert into public.recipes (name, product_id, yield_servings, is_demo)
  select name, id, 1, true from public.products where slug = 'bottled-water' returning id into v_recipe;
  insert into public.recipe_ingredients (recipe_id, inventory_item_id, quantity, unit, cost_type)
  select v_recipe, id, 1, 'bottle', 'drink' from public.inventory_items where sku = 'WATR-01';

  insert into public.recipes (name, product_id, yield_servings, is_demo)
  select name, id, 1, true from public.products where slug = 'iced-tea-refill' returning id into v_recipe;
  insert into public.recipe_ingredients (recipe_id, sub_recipe_id, quantity, cost_type) values (v_recipe, v_tea, 1, 'drink');
end $$;

select public.snapshot_product_costs();

-- Rewards -----------------------------------------------------------------------
insert into public.rewards (name, description, reward_type, value, product_id, points_cost, is_redeemable, per_customer_limit, valid_days, is_demo)
select v.name, v.description, v.rtype::public.reward_type, v.value, p.id, v.cost, v.redeemable, v.per_limit, v.days, true
from (values
  ('Free Calamansi Juice', 'Swap your iced tea for a fresh calamansi juice, on us.', 'free_product', 0, 'calamansi-juice', 10, true, null, 30),
  ('₱20 off any meal', 'Twenty pesos off your next order.', 'fixed_discount', 20, null, 15, true, null, 30),
  ('Free Java Dawg', 'A whole Java Dawg meal for free.', 'free_product', 0, 'java-dawg', 40, true, 2, 30),
  ('10% off your order', 'Ten percent off the whole order.', 'percent_discount', 10, null, 25, true, null, 30),
  ('Free Fried Egg', 'Add a fried egg to any meal for free. Play Zone prize.', 'free_product', 0, 'fried-egg', 0, false, null, 7),
  ('₱10 off coupon', 'Ten pesos off your next order. Play Zone prize.', 'fixed_discount', 10, null, 0, false, null, 7)
) as v(name, description, rtype, value, product_slug, cost, redeemable, per_limit, days)
left join public.products p on p.slug = v.product_slug;

-- Promotions ----------------------------------------------------------------------
insert into public.promotions (name, description, code, discount_type, value, min_subtotal, applies_online, applies_pos, is_active, is_demo) values
  ('Barkada Bundle', '₱25 off orders of ₱300 or more. Perfect for group study nights.', 'BARKADA25', 'fixed', 25, 300, true, true, true, true),
  ('Exam Week Treat', '5% off online orders during exam week.', 'EXAMWEEK', 'percent', 5, 0, true, false, false, true);

-- Games ---------------------------------------------------------------------------
insert into public.games (code, name, tagline, rules, is_enabled, daily_play_limit, cooldown_seconds, daily_points_cap, config, sort_order) values
  ('catch', 'Java Catch', 'Catch the falling Java Rice, dodge the rocks.',
   'Move the tray left and right to catch falling Java Rice cups (1 point) and golden rice (3 points). Each rock you hit takes away 2 points. A round lasts 30 seconds. Higher scores win bigger prizes.',
   true, 3, 60, 6, '{"duration_seconds":30,"item_count":60}', 1),
  ('memory', 'Kubo Memory Match', 'Flip and match the kubo favourites.',
   'Flip two cards at a time to find matching pairs. Finish in fewer moves for a higher score (a perfect game is 8 moves = 100 points). You have 3 minutes.',
   true, 3, 60, 6, '{}', 2),
  ('wheel', 'Lucky Kubo Wheel', 'One free spin every day.',
   'Spin once a day for a chance to win bonus points or a coupon. Prizes are random and not guaranteed.',
   true, 1, 0, 10, '{}', 3),
  ('quiz', 'Kainan sa Kubo Food Quiz', 'How well do you know the menu?',
   'Answer 5 quick questions about Kainan sa Kubo and Filipino food within 2 minutes. Get 4 or more right to win points.',
   true, 2, 120, 4, '{"question_count":5}', 4);

insert into public.game_prizes (game_code, label, prize_type, points, reward_id, weight, min_score, sort_order)
select v.game, v.label, v.ptype::public.prize_type, v.points, r.id, v.weight, v.min_score, v.so
from (values
  ('catch', 'Nice try!', 'none', 0, null, 0, 0, 1),
  ('catch', '+1 point', 'points', 1, null, 0, 15, 2),
  ('catch', '+2 points', 'points', 2, null, 0, 30, 3),
  ('catch', '+3 points', 'points', 3, null, 0, 45, 4),
  ('memory', 'Nice try!', 'none', 0, null, 0, 0, 1),
  ('memory', '+1 point', 'points', 1, null, 0, 60, 2),
  ('memory', '+2 points', 'points', 2, null, 0, 80, 3),
  ('memory', 'Free Fried Egg coupon', 'reward', 0, 'Free Fried Egg', 0, 96, 4),
  ('quiz', 'Nice try!', 'none', 0, null, 0, 0, 1),
  ('quiz', '+1 point', 'points', 1, null, 0, 4, 2),
  ('quiz', '+2 points', 'points', 2, null, 0, 5, 3),
  ('wheel', 'Try again tomorrow', 'none', 0, null, 40, 0, 1),
  ('wheel', '+1 point', 'points', 1, null, 30, 0, 2),
  ('wheel', '+2 points', 'points', 2, null, 15, 0, 3),
  ('wheel', '₱10 off coupon', 'reward', 0, '₱10 off coupon', 8, 0, 4),
  ('wheel', 'Free Fried Egg', 'reward', 0, 'Free Fried Egg', 5, 0, 5),
  ('wheel', '+5 points', 'points', 5, null, 2, 0, 6)
) as v(game, label, ptype, points, reward_name, weight, min_score, so)
left join public.rewards r on r.name = v.reward_name;

insert into public.quiz_questions (question, choices, correct_index, explanation) values
  ('What gives Java Rice its golden colour?', '["Turmeric","Atsuete (annatto)","Saffron","Egg yolk"]', 1, 'Java Rice gets its colour from atsuete (annatto).'),
  ('How many loyalty points does a ₱65 meal earn?', '["0","1","2","3"]', 1, 'Meals ₱65 and below earn 1 point.'),
  ('How many loyalty points does a ₱70 meal earn?', '["1","2","3","5"]', 1, 'Meals above ₱65 earn 2 points.'),
  ('Which meal comes with a jumbo hotdog?', '["Java Toc","Java Long","Java Dawg","Java Chick"]', 2, 'Java Dawg is our hotdog meal.'),
  ('What drink comes free with every Kainan sa Kubo meal?', '["Calamansi juice","Iced tea","Bottled water","Coffee"]', 1, 'Every meal comes with free drinks.'),
  ('Tocino is traditionally what kind of meat?', '["Beef","Chicken","Sweet-cured pork","Fish"]', 2, 'Tocino is sweet-cured pork.'),
  ('Sisig is famously from which province?', '["Cebu","Pampanga","Ilocos Norte","Batangas"]', 1, 'Sisig comes from Pampanga.'),
  ('What is "daing na bangus"?', '["Grilled squid","Marinated milkfish","Fried tilapia","Shrimp paste"]', 1, 'Daing na bangus is vinegar-marinated milkfish.'),
  ('What is atchara made from?', '["Green papaya","Cabbage","Mango","Cucumber"]', 0, 'Atchara is pickled green papaya.'),
  ('What is a "kubo"?', '["A rice cooker","A bamboo hut","A street food cart","A dessert"]', 1, 'A bahay kubo is a traditional bamboo hut.'),
  ('What lines our black trays before the food goes on?', '["Banana leaf","Greaseproof paper","Newspaper","Foil"]', 1, 'Every tray is lined with greaseproof paper.'),
  ('Longganisa is best described as…', '["A Filipino sausage","A rice cake","A noodle dish","A soup"]', 0, 'Longganisa is a Filipino sausage.');
