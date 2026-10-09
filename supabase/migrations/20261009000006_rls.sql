-- =============================================================================
-- Java Kubo — row level security and function privileges
-- Default: deny. Every table has RLS on; writes to money, stock and points
-- tables happen only inside SECURITY DEFINER functions that check roles.
-- =============================================================================

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Public catalogue (readable by everyone, writable by admins)
-- ---------------------------------------------------------------------------
create policy "store settings are public" on public.store_settings for select using (true);
create policy "admins update store settings" on public.store_settings for update
  using (public.is_admin()) with check (public.is_admin());

create policy "active categories are public" on public.categories for select
  using (is_active or public.is_staff());
create policy "admins manage categories" on public.categories for all
  using (public.is_admin()) with check (public.is_admin());

create policy "menu products are public" on public.products for select
  using (not is_archived or public.is_staff());
create policy "admins manage products" on public.products for all
  using (public.is_admin()) with check (public.is_admin());

create policy "product add-ons are public" on public.product_addons for select using (true);
create policy "admins manage product add-ons" on public.product_addons for all
  using (public.is_admin()) with check (public.is_admin());

create policy "active payment methods are public" on public.payment_methods for select
  using (is_active or public.is_admin());
create policy "admins manage payment methods" on public.payment_methods for all
  using (public.is_admin()) with check (public.is_admin());

create policy "active promotions are public" on public.promotions for select
  using ((is_active and (ends_at is null or ends_at > now())) or public.is_staff());
create policy "admins manage promotions" on public.promotions for all
  using (public.is_admin()) with check (public.is_admin());

create policy "active rewards are public" on public.rewards for select
  using (is_active or public.is_staff());
create policy "admins manage rewards" on public.rewards for all
  using (public.is_admin()) with check (public.is_admin());

create policy "games are public" on public.games for select using (true);
create policy "admins update games" on public.games for update
  using (public.is_admin()) with check (public.is_admin());

create policy "active prizes are public" on public.game_prizes for select
  using (is_active or public.is_admin());
create policy "admins manage prizes" on public.game_prizes for all
  using (public.is_admin()) with check (public.is_admin());

-- Quiz answers are secret: admins only
create policy "admins manage quiz" on public.quiz_questions for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create policy "read own profile; staff read all" on public.profiles for select
  using (id = auth.uid() or public.is_staff());
create policy "update own profile" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
create policy "admins update profiles" on public.profiles for update
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Back office (admin only)
-- ---------------------------------------------------------------------------
create policy "admins manage suppliers" on public.suppliers for all
  using (public.is_admin()) with check (public.is_admin());
create policy "admins manage inventory items" on public.inventory_items for all
  using (public.is_admin()) with check (public.is_admin());
create policy "admins read movements" on public.inventory_movements for select using (public.is_admin());
create policy "admins manage recipes" on public.recipes for all
  using (public.is_admin()) with check (public.is_admin());
create policy "admins read recipe lines" on public.recipe_ingredients for select using (public.is_admin());
create policy "admins read cost history" on public.product_cost_history for select using (public.is_admin());
create policy "admins read purchase orders" on public.purchase_orders for select using (public.is_admin());
create policy "admins read purchase order items" on public.purchase_order_items for select using (public.is_admin());
create policy "admins manage expenses" on public.operating_expenses for all
  using (public.is_admin()) with check (public.is_admin());
create policy "admins read audit log" on public.audit_logs for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Orders: customers see their own, staff see all. No direct writes.
-- ---------------------------------------------------------------------------
create policy "own orders or staff" on public.orders for select
  using (customer_id = auth.uid() or public.is_staff());
create policy "items of visible orders" on public.order_items for select
  using (exists (select 1 from public.orders o where o.id = order_id and (o.customer_id = auth.uid() or public.is_staff())));
create policy "history of visible orders" on public.order_status_history for select
  using (exists (select 1 from public.orders o where o.id = order_id and (o.customer_id = auth.uid() or public.is_staff())));
create policy "payments of visible orders" on public.payments for select
  using (exists (select 1 from public.orders o where o.id = order_id and (o.customer_id = auth.uid() or public.is_staff())));
create policy "refunds of visible orders" on public.refunds for select
  using (exists (select 1 from public.orders o where o.id = order_id and (o.customer_id = auth.uid() or public.is_staff())));
create policy "refund items for staff" on public.refund_items for select using (public.is_staff());

-- ---------------------------------------------------------------------------
-- Loyalty and games: own rows only
-- ---------------------------------------------------------------------------
create policy "own ledger or admin" on public.loyalty_ledger for select
  using (customer_id = auth.uid() or public.is_admin());
create policy "own redemptions or staff" on public.reward_redemptions for select
  using (customer_id = auth.uid() or public.is_staff());
create policy "own game sessions or admin" on public.game_sessions for select
  using (customer_id = auth.uid() or public.is_admin());
create policy "own game rewards or admin" on public.game_rewards for select
  using (customer_id = auth.uid() or public.is_admin());

-- staff_pins, override_grants, game_session_secrets, daily_counters:
-- RLS enabled with no policies = no client access.

-- ---------------------------------------------------------------------------
-- Function privileges: revoke everything, then grant the public API.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

-- Used inside RLS policies and safe to expose
grant execute on function public.is_admin(), public.is_staff(), public.has_permission(text),
  public.current_app_role(), public.manila_today(), public.manila_date(timestamptz)
  to anon, authenticated;

-- Customer API
grant execute on function
  public.place_online_order(jsonb, public.service_type, text, text, text, text, text, text),
  public.quote_order(public.order_channel, jsonb, public.service_type, text, text, text),
  public.cancel_my_order(uuid, text),
  public.redeem_reward(uuid),
  public.game_start(text),
  public.game_memory_flip(uuid, integer),
  public.game_finish(uuid, jsonb),
  public.game_spin_wheel(),
  public.my_game_status()
  to authenticated;

-- Staff API (each function checks the role itself)
grant execute on function
  public.pos_create_order(jsonb, public.service_type, text, numeric, text, uuid, text, text, text, text, numeric, text, uuid, boolean, text, text),
  public.update_order_status(uuid, public.order_status, text, uuid),
  public.record_order_payment(uuid, text, numeric, text),
  public.verify_payment(uuid, boolean, text),
  public.refund_order(uuid, jsonb, text, boolean, uuid),
  public.lookup_redemption(text),
  public.use_redemption_at_counter(text, text),
  public.set_product_availability(uuid, boolean),
  public.set_my_pin(text),
  public.has_pin(),
  public.request_override(text, text),
  public.staff_today_summary()
  to authenticated;

-- Admin API
grant execute on function
  public.save_recipe(uuid, text, uuid, numeric, text, jsonb),
  public.admin_snapshot_costs(),
  public.admin_recipe_costs(),
  public.recipe_cost_breakdown(uuid, public.service_type),
  public.product_costing(),
  public.record_stock_adjustment(uuid, public.movement_type, numeric, numeric, text),
  public.create_purchase_order(uuid, date, text, jsonb, boolean),
  public.receive_purchase_order(uuid),
  public.cancel_purchase_order(uuid, text),
  public.cancel_redemption(uuid, text),
  public.admin_adjust_points(uuid, integer, text),
  public.admin_set_user_access(uuid, public.app_role, text[], boolean),
  public.report_summary(date, date),
  public.report_daily_sales(date, date),
  public.report_product_sales(date, date),
  public.report_ingredient_usage(date, date),
  public.report_staff_summary(date, date),
  public.report_loyalty(date, date),
  public.report_top_customers(date, date, integer),
  public.inventory_overview()
  to authenticated;

-- Functions created later by the migration role must not be public by default
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Column privileges: food cost snapshots are internal. Clients may read every
-- order_items column except unit_cost; admins read costs through
-- admin_order_item_costs().
-- ---------------------------------------------------------------------------
revoke select on public.order_items from anon, authenticated;
grant select (id, order_id, parent_item_id, product_id, product_name, category_name, unit_price, quantity,
              line_total, points_eligible, points_per_unit, refunded_quantity, notes, created_at)
  on public.order_items to anon, authenticated;

create or replace function public.admin_order_item_costs(p_order_id uuid)
returns table (order_item_id uuid, unit_cost numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_admin();
  return query select oi.id, oi.unit_cost from public.order_items oi where oi.order_id = p_order_id;
end $$;
revoke execute on function public.admin_order_item_costs(uuid) from public, anon;
grant execute on function public.admin_order_item_costs(uuid) to authenticated;
