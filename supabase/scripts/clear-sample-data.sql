-- =============================================================================
-- One-off cleanup: remove sample/test data, KEEP the menu.
-- Run once in Supabase → SQL Editor. Everything happens in one transaction,
-- so if any step fails nothing is deleted.
--
-- Removes:  sample inventory, suppliers, recipes & cost history, purchases;
--           test activity (points history, reward codes, game rounds) and
--           resets everyone's points/tokens to 0; sample rewards & promo codes
--           (and the coupon prizes that pointed to them); audit log history.
-- Keeps:    menu categories, menu items, add-ons, photos; store settings;
--           payment methods; accounts; games, quiz questions and the
--           points/no-prize game prizes.
-- =============================================================================
begin;

-- Test activity --------------------------------------------------------------
-- The points/token ledgers are append-only; lift that guard just for this cleanup.
alter table public.loyalty_ledger disable trigger trg_loyalty_ledger_append_only;
alter table public.game_token_ledger disable trigger trg_game_token_ledger_append_only;

delete from public.loyalty_ledger;
delete from public.game_token_ledger;
update public.profiles set points_balance = 0, game_tokens = 0;
delete from public.game_rewards;
delete from public.game_sessions;          -- secrets are removed with them
delete from public.reward_redemptions;

alter table public.loyalty_ledger enable trigger trg_loyalty_ledger_append_only;
alter table public.game_token_ledger enable trigger trg_game_token_ledger_append_only;

-- Sample rewards & promo codes ------------------------------------------------
delete from public.game_prizes where prize_type = 'reward';  -- coupon prizes used the sample rewards
delete from public.rewards;
delete from public.promotions;

-- Sample inventory, suppliers, recipes ------------------------------------------
delete from public.recipe_ingredients;
delete from public.recipes;
delete from public.product_cost_history;
delete from public.purchase_order_items;
delete from public.purchase_orders;
delete from public.inventory_movements;
delete from public.inventory_items;
delete from public.suppliers;

-- History ------------------------------------------------------------------------
delete from public.override_grants;
delete from public.audit_logs;   -- last, so the deletions above aren't logged either

commit;

-- Quick check (should show 0 for everything except the menu)
select
  (select count(*) from public.products)          as menu_items,
  (select count(*) from public.inventory_items)   as ingredients,
  (select count(*) from public.recipes)           as recipes,
  (select count(*) from public.suppliers)         as suppliers,
  (select count(*) from public.rewards)           as rewards,
  (select count(*) from public.promotions)        as promotions,
  (select count(*) from public.loyalty_ledger)    as points_history,
  (select count(*) from public.game_sessions)     as game_rounds,
  (select count(*) from public.audit_logs)        as audit_logs;
