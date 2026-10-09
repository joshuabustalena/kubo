-- =============================================================================
-- Java Kubo — orders, payments, refunds, inventory deduction, loyalty
-- Every function here re-reads prices, stock and rewards from the database;
-- nothing the browser sends is trusted beyond product ids and quantities.
-- =============================================================================

create or replace function public.points_for_price(p_price numeric)
returns integer language sql stable security definer set search_path = public as $$
  select case when not s.points_enabled then 0
              when p_price <= s.points_price_threshold then s.points_at_or_below
              else s.points_above end
    from public.store_settings s where s.id
$$;

-- ---------------------------------------------------------------------------
-- Loyalty ledger keeps profiles.points_balance in sync
-- ---------------------------------------------------------------------------
create or replace function public.apply_ledger_entry()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set points_balance = points_balance + new.points where id = new.customer_id;
  return new;
end $$;

create trigger trg_loyalty_ledger_apply after insert on public.loyalty_ledger
  for each row execute function public.apply_ledger_entry();

create or replace function public.block_ledger_changes()
returns trigger language plpgsql as $$
begin
  raise exception 'The points ledger is append-only. Record an adjustment instead.';
end $$;

create trigger trg_loyalty_ledger_append_only before update or delete on public.loyalty_ledger
  for each row execute function public.block_ledger_changes();

-- Inserts a ledger row once per idempotency key. Returns true if inserted.
create or replace function public.add_ledger_entry(
  p_customer_id uuid, p_points integer, p_type public.ledger_entry_type, p_description text,
  p_key text, p_order_id uuid default null, p_refund_id uuid default null,
  p_redemption_id uuid default null, p_game_session_id uuid default null
) returns boolean language plpgsql volatile security definer set search_path = public as $$
declare v_count integer;
begin
  if p_points = 0 or p_customer_id is null then return false; end if;
  insert into public.loyalty_ledger (customer_id, points, entry_type, description, idempotency_key,
    order_id, refund_id, redemption_id, game_session_id, created_by)
  values (p_customer_id, p_points, p_type, p_description, p_key,
    p_order_id, p_refund_id, p_redemption_id, p_game_session_id, auth.uid())
  on conflict (idempotency_key) do nothing;
  get diagnostics v_count = row_count;
  return v_count = 1;
end $$;

-- ---------------------------------------------------------------------------
-- Order creation (shared by online checkout and the POS)
-- ---------------------------------------------------------------------------
create or replace function public.create_order_internal(
  p_channel public.order_channel,
  p_customer_id uuid,
  p_customer_name text,
  p_service public.service_type,
  p_items jsonb,
  p_payment_method text,
  p_notes text,
  p_promo_code text,
  p_redemption_code text,
  p_manual_discount_type text,
  p_manual_discount_value numeric,
  p_discount_reason text,
  p_discount_authorized_by uuid,
  p_manual_discount_max_percent numeric,
  p_staff_id uuid,
  p_idempotency_key text
) returns public.orders language plpgsql volatile security definer set search_path = public as $$
declare
  s public.store_settings;
  o public.orders;
  v_order_id uuid := gen_random_uuid();
  v_item jsonb;
  v_addon_id uuid;
  p public.products;
  ap public.products;
  v_cat_name text;
  v_qty integer;
  v_parent_id uuid;
  v_subtotal numeric := 0;
  v_pm public.payment_methods;
  v_promo public.promotions;
  v_promo_disc numeric := 0;
  v_red public.reward_redemptions;
  v_reward public.rewards;
  v_red_disc numeric := 0;
  v_manual numeric := 0;
  v_disc numeric;
  v_pack numeric := 0;
  v_customer uuid := p_customer_id;
  v_lines integer := 0;
begin
  if coalesce(length(p_idempotency_key), 0) < 8 then
    raise exception 'Missing request key.';
  end if;
  select * into s from public.store_settings where id;

  select * into v_pm from public.payment_methods where code = p_payment_method and is_active;
  if not found or (p_channel = 'online' and not v_pm.allow_online) or (p_channel = 'pos' and not v_pm.allow_pos) then
    raise exception 'That payment method is not available.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'The order has no items.';
  end if;
  if jsonb_array_length(p_items) > 30 then
    raise exception 'Too many different items in one order.';
  end if;

  insert into public.orders (id, order_number, channel, customer_id, customer_name, service_type, status,
    payment_method_code, subtotal, total, notes, staff_id, idempotency_key)
  values (v_order_id, public.next_order_number(), p_channel, v_customer, left(coalesce(p_customer_name, ''), 120),
    p_service, 'pending', v_pm.code, 0, 0, left(coalesce(p_notes, ''), 500), p_staff_id, p_idempotency_key);

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := case when (v_item ->> 'quantity') ~ '^[0-9]{1,3}$' then (v_item ->> 'quantity')::integer end;
    if v_qty is null or v_qty < 1 or v_qty > 20 then
      raise exception 'Quantities must be between 1 and 20.';
    end if;
    select pr.* into p from public.products pr join public.categories c on c.id = pr.category_id
     where pr.id = public.try_uuid(v_item ->> 'product_id') and not pr.is_archived and c.is_active;
    if not found then
      raise exception 'An item in the order is no longer on the menu. Please refresh.';
    end if;
    if not p.is_available then
      raise exception '% is sold out right now.', p.name;
    end if;
    select name into v_cat_name from public.categories where id = p.category_id;

    v_parent_id := gen_random_uuid();
    insert into public.order_items (id, order_id, product_id, product_name, category_name, unit_price,
      quantity, line_total, unit_cost, points_eligible, points_per_unit, notes)
    values (v_parent_id, v_order_id, p.id, p.name, v_cat_name, p.price, v_qty, p.price * v_qty,
      public.product_unit_cost(p.id, p_service), p.points_eligible,
      case when p.points_eligible then public.points_for_price(p.price) else 0 end,
      left(coalesce(v_item ->> 'notes', ''), 200));
    v_subtotal := v_subtotal + p.price * v_qty;
    v_lines := v_lines + 1;

    if jsonb_typeof(v_item -> 'addons') = 'array' then
      for v_addon_id in select distinct public.try_uuid(x) from jsonb_array_elements_text(v_item -> 'addons') x loop
        select a.* into ap from public.products a
          join public.product_addons pa on pa.addon_product_id = a.id and pa.product_id = p.id
         where a.id = v_addon_id and not a.is_archived;
        if not found then
          raise exception 'An add-on is not available for %.', p.name;
        end if;
        if not ap.is_available then
          raise exception 'Add-on % is sold out right now.', ap.name;
        end if;
        insert into public.order_items (order_id, parent_item_id, product_id, product_name, category_name,
          unit_price, quantity, line_total, unit_cost, points_eligible, points_per_unit)
        values (v_order_id, v_parent_id, ap.id, ap.name, 'Add-on', ap.price, v_qty, ap.price * v_qty,
          public.product_unit_cost(ap.id, p_service), ap.points_eligible and s.points_on_addons,
          case when ap.points_eligible and s.points_on_addons then public.points_for_price(ap.price) else 0 end);
        v_subtotal := v_subtotal + ap.price * v_qty;
      end loop;
    end if;
  end loop;

  -- Promo code
  if nullif(trim(p_promo_code), '') is not null then
    select * into v_promo from public.promotions
     where code = upper(trim(p_promo_code)) and is_active
       and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())
       and ((p_channel = 'online' and applies_online) or (p_channel = 'pos' and applies_pos));
    if not found then raise exception 'That promo code is invalid or has expired.'; end if;
    if v_subtotal < v_promo.min_subtotal then
      raise exception 'That promo needs a minimum order of ₱%.', to_char(v_promo.min_subtotal, 'FM999,990.00');
    end if;
    v_promo_disc := case when v_promo.discount_type = 'percent'
                         then round(v_subtotal * v_promo.value / 100, 2) else v_promo.value end;
  end if;

  -- Reward redemption code
  if nullif(trim(p_redemption_code), '') is not null then
    select * into v_red from public.reward_redemptions where code = upper(trim(p_redemption_code)) for update;
    if not found or (p_channel = 'online' and v_red.customer_id <> p_customer_id) then
      raise exception 'Reward code not found.';
    end if;
    if v_red.status <> 'issued' then raise exception 'This reward code was already used or cancelled.'; end if;
    if v_red.expires_at <= now() then raise exception 'This reward code has expired.'; end if;
    select * into v_reward from public.rewards where id = v_red.reward_id;
    v_red_disc := case v_reward.reward_type
      when 'fixed_discount' then v_reward.value
      when 'percent_discount' then round(v_subtotal * v_reward.value / 100, 2)
      else coalesce((select max(unit_price) from public.order_items
                      where order_id = v_order_id and product_id = v_reward.product_id), 0) end;
    if v_reward.reward_type = 'free_product' and v_red_disc = 0 then
      raise exception 'Add % to the order to use this reward.',
        (select name from public.products where id = v_reward.product_id);
    end if;
    v_red_disc := least(v_red_disc, v_subtotal);
    if v_customer is null then v_customer := v_red.customer_id; end if;
    update public.reward_redemptions
       set status = 'used', used_at = now(), used_by = coalesce(p_staff_id, auth.uid()),
           order_id = v_order_id, discount_applied = v_red_disc
     where id = v_red.id;
  end if;

  -- Manual (staff) discount
  if p_manual_discount_type is not null and coalesce(p_manual_discount_value, 0) > 0 then
    if p_manual_discount_type not in ('percent', 'fixed') then raise exception 'Invalid discount type.'; end if;
    if coalesce(trim(p_discount_reason), '') = '' then raise exception 'A discount needs a reason.'; end if;
    v_manual := case when p_manual_discount_type = 'percent'
                     then round(v_subtotal * least(p_manual_discount_value, 100) / 100, 2)
                     else p_manual_discount_value end;
    if p_manual_discount_max_percent is not null and v_subtotal > 0
       and v_manual / v_subtotal * 100 > p_manual_discount_max_percent then
      raise exception 'AUTH_REQUIRED_ADMIN: Discounts above % percent need an admin PIN.', p_manual_discount_max_percent;
    end if;
  end if;

  v_disc := least(v_subtotal, v_promo_disc + v_red_disc + v_manual);
  if p_service = 'takeout' then v_pack := s.takeout_packaging_fee; end if;

  update public.orders
     set customer_id = v_customer,
         subtotal = v_subtotal, packaging_fee = v_pack, discount_total = v_disc,
         total = v_subtotal + v_pack - v_disc,
         promotion_id = v_promo.id,
         reward_redemption_id = v_red.id,
         discount_reason = case when v_manual > 0 then p_discount_reason
                                when v_promo.id is not null then 'Promo ' || v_promo.code
                                when v_red.id is not null then 'Reward ' || v_red.code else '' end,
         discount_authorized_by = case when v_manual > 0 then p_discount_authorized_by end
   where id = v_order_id
  returning * into o;

  -- Optional: refuse orders the kitchen cannot make from current stock
  if s.block_orders_on_low_stock and exists (
    select 1 from (
      select req.inventory_item_id, sum(req.quantity) as need
        from public.order_items oi
        join public.recipes r on r.product_id = oi.product_id
        cross join lateral public.recipe_requirements(r.id, oi.quantity, p_service) req
       where oi.order_id = v_order_id
       group by req.inventory_item_id
    ) n join public.inventory_items i on i.id = n.inventory_item_id
     where i.current_stock < n.need
  ) then
    raise exception 'Sorry, we are running low on ingredients for part of this order. Please adjust it or ask the counter.';
  end if;

  insert into public.order_status_history (order_id, from_status, to_status, note, changed_by)
  values (v_order_id, null, 'pending', case when p_channel = 'online' then 'Placed online' else 'Rung up at POS' end, auth.uid());
  return o;
end $$;

-- ---------------------------------------------------------------------------
-- Inventory deduction / reversal for orders
-- ---------------------------------------------------------------------------
create or replace function public.deduct_order_inventory(p_order_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  o public.orders;
  v_req record;
begin
  select * into o from public.orders where id = p_order_id for update;
  if o.inventory_deducted_at is not null then return; end if;
  for v_req in
    select req.inventory_item_id, sum(req.quantity) as qty
      from public.order_items oi
      join public.recipes r on r.product_id = oi.product_id
      cross join lateral public.recipe_requirements(r.id, oi.quantity - oi.refunded_quantity, o.service_type) req
     where oi.order_id = p_order_id and oi.quantity > oi.refunded_quantity
     group by req.inventory_item_id
  loop
    perform public.apply_stock_movement(v_req.inventory_item_id, 'sale', -v_req.qty, null,
      p_order_id, null, null, 'Order ' || o.order_number);
  end loop;
  update public.orders set inventory_deducted_at = now() where id = p_order_id;
end $$;

create or replace function public.reverse_order_inventory(p_order_id uuid, p_note text)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  o public.orders;
  m record;
begin
  select * into o from public.orders where id = p_order_id for update;
  if o.inventory_deducted_at is null or o.inventory_reversed_at is not null then return; end if;
  for m in
    select inventory_item_id, sum(quantity) as qty, max(unit_cost) as unit_cost
      from public.inventory_movements
     where order_id = p_order_id and movement_type = 'sale' and refund_id is null
     group by inventory_item_id
  loop
    perform public.apply_stock_movement(m.inventory_item_id, 'sale_reversal', -m.qty, m.unit_cost,
      p_order_id, null, null, coalesce(p_note, 'Order reversed'));
  end loop;
  update public.orders set inventory_reversed_at = now() where id = p_order_id;
end $$;

-- ---------------------------------------------------------------------------
-- Points for completed, paid orders (exactly once per order)
-- ---------------------------------------------------------------------------
create or replace function public.award_order_points(p_order_id uuid)
returns integer language plpgsql volatile security definer set search_path = public as $$
declare
  o public.orders;
  v_points integer;
begin
  select * into o from public.orders where id = p_order_id for update;
  if o.customer_id is null or o.points_awarded_at is not null
     or o.status <> 'completed' or o.payment_status not in ('paid', 'partially_refunded') then
    return 0;
  end if;
  select coalesce(sum(points_per_unit * (quantity - refunded_quantity)), 0)::integer into v_points
    from public.order_items where order_id = p_order_id and points_eligible;
  update public.orders set points_awarded_at = now() where id = p_order_id;
  if v_points > 0 then
    perform public.add_ledger_entry(o.customer_id, v_points, 'earn', 'Order ' || o.order_number,
      'order:' || p_order_id || ':earn', p_order_id);
  end if;
  return v_points;
end $$;

-- ---------------------------------------------------------------------------
-- Status transitions (single place for side effects)
-- ---------------------------------------------------------------------------
create or replace function public.transition_order(
  p_order_id uuid, p_to public.order_status, p_note text
) returns public.orders language plpgsql volatile security definer set search_path = public as $$
declare
  o public.orders;
  s public.store_settings;
  v_allowed boolean;
begin
  select * into s from public.store_settings where id;
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found.'; end if;
  if o.status = p_to then return o; end if; -- repeated request: no-op

  v_allowed := case o.status
    when 'pending' then p_to in ('confirmed', 'preparing', 'cancelled')
    when 'confirmed' then p_to in ('preparing', 'ready', 'completed', 'cancelled')
    when 'preparing' then p_to in ('ready', 'completed', 'cancelled')
    when 'ready' then p_to in ('completed', 'cancelled')
    else false end;
  if not v_allowed then
    raise exception 'Cannot move an order from % to %.', o.status, p_to;
  end if;
  if p_to = 'completed' and o.payment_status <> 'paid' then
    raise exception 'Record the payment before completing this order.';
  end if;

  update public.orders
     set status = p_to,
         confirmed_at = case when p_to in ('confirmed', 'preparing') and confirmed_at is null then now() else confirmed_at end,
         completed_at = case when p_to = 'completed' then now() else completed_at end,
         cancelled_at = case when p_to = 'cancelled' then now() else cancelled_at end,
         cancel_reason = case when p_to = 'cancelled' then coalesce(p_note, '') else cancel_reason end
   where id = p_order_id;
  insert into public.order_status_history (order_id, from_status, to_status, note, changed_by)
  values (p_order_id, o.status, p_to, coalesce(p_note, ''), auth.uid());

  if p_to = 'completed' or (s.inventory_deduct_stage = 'preparing' and p_to in ('preparing', 'ready')) then
    perform public.deduct_order_inventory(p_order_id);
  end if;

  if p_to = 'completed' then
    perform public.award_order_points(p_order_id);
  end if;

  if p_to = 'cancelled' then
    if s.restock_on_cancel then
      perform public.reverse_order_inventory(p_order_id, 'Cancelled order ' || o.order_number || ' restocked');
    end if;
    -- Give the customer their reward code back
    update public.reward_redemptions
       set status = case when expires_at > now() then 'issued'::public.redemption_status else 'expired' end,
           used_at = null, used_by = null, order_id = null, discount_applied = 0
     where id = o.reward_redemption_id and status = 'used' and order_id = p_order_id;
  end if;

  select * into o from public.orders where id = p_order_id;
  return o;
end $$;

-- ---------------------------------------------------------------------------
-- Customer: place an online order
-- ---------------------------------------------------------------------------
create or replace function public.place_online_order(
  p_items jsonb,
  p_service_type public.service_type,
  p_payment_method text,
  p_payment_reference text,
  p_notes text,
  p_promo_code text,
  p_redemption_code text,
  p_idempotency_key text
) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := public.assert_signed_in();
  v_profile public.profiles;
  o public.orders;
  v_pm public.payment_methods;
begin
  if not (select online_ordering_enabled from public.store_settings where id) then
    raise exception 'Online ordering is paused right now. Please order at the counter.';
  end if;

  select * into o from public.orders where idempotency_key = p_idempotency_key;
  if found then
    if o.customer_id is distinct from v_uid then raise exception 'Duplicate request.'; end if;
    return jsonb_build_object('order_id', o.id, 'order_number', o.order_number, 'total', o.total);
  end if;

  -- Simple anti-spam: max 5 open online orders per customer
  if (select count(*) from public.orders where customer_id = v_uid and channel = 'online'
        and status in ('pending', 'confirmed', 'preparing', 'ready')) >= 5 then
    raise exception 'You have too many open orders. Please wait for them to finish.';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  select * into v_pm from public.payment_methods where code = p_payment_method;
  if v_pm.requires_reference and coalesce(trim(p_payment_reference), '') = '' then
    raise exception 'Enter the % reference number of your payment.', v_pm.name;
  end if;

  o := public.create_order_internal('online', v_uid, v_profile.full_name, p_service_type, p_items,
    p_payment_method, p_notes, p_promo_code, p_redemption_code, null, null, null, null, null, null, p_idempotency_key);

  if not v_pm.is_cash then
    -- Digital payment: recorded as pending until staff verify it. Never auto-marked paid.
    insert into public.payments (order_id, method_code, amount, reference_no, status)
    values (o.id, v_pm.code, o.total, left(trim(coalesce(p_payment_reference, '')), 60), 'pending');
    update public.orders set payment_status = 'pending_verification' where id = o.id;
  end if;

  return jsonb_build_object('order_id', o.id, 'order_number', o.order_number, 'total', o.total);
end $$;

create or replace function public.cancel_my_order(p_order_id uuid, p_reason text)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := public.assert_signed_in();
  o public.orders;
begin
  select * into o from public.orders where id = p_order_id and customer_id = v_uid for update;
  if not found then raise exception 'Order not found.'; end if;
  if o.status <> 'pending' then
    raise exception 'This order is already being handled. Please talk to the counter to cancel.';
  end if;
  if o.payment_status <> 'unpaid' then
    raise exception 'This order has a payment attached. Please talk to the counter to cancel.';
  end if;
  perform public.transition_order(p_order_id, 'cancelled', 'Cancelled by customer: ' || coalesce(nullif(trim(p_reason), ''), 'no reason given'));
  perform public.log_audit('order.cancel_by_customer', 'order', p_order_id::text, jsonb_build_object('order_number', o.order_number));
end $$;

-- ---------------------------------------------------------------------------
-- Staff: POS sale (walk-in)
-- ---------------------------------------------------------------------------
create or replace function public.pos_create_order(
  p_items jsonb,
  p_service_type public.service_type,
  p_payment_method text,
  p_amount_tendered numeric,
  p_payment_reference text,
  p_customer_id uuid,
  p_customer_name text,
  p_promo_code text,
  p_redemption_code text,
  p_discount_type text,
  p_discount_value numeric,
  p_discount_reason text,
  p_override_grant uuid,
  p_complete_now boolean,
  p_notes text,
  p_idempotency_key text
) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := public.assert_staff();
  s public.store_settings;
  o public.orders;
  v_pm public.payment_methods;
  v_authorizer uuid;
  v_max numeric;
  v_change numeric := 0;
  v_customer_name text := p_customer_name;
begin
  select * into s from public.store_settings where id;

  select * into o from public.orders where idempotency_key = p_idempotency_key;
  if found then
    if o.staff_id is distinct from v_uid then raise exception 'Duplicate request.'; end if;
    return jsonb_build_object('order_id', o.id, 'order_number', o.order_number, 'total', o.total,
      'change', (select change_given from public.payments where order_id = o.id and status = 'verified'), 'replayed', true);
  end if;

  select * into v_pm from public.payment_methods where code = p_payment_method and is_active and allow_pos;
  if not found then raise exception 'That payment method is not available at the POS.'; end if;

  if p_discount_type is not null and coalesce(p_discount_value, 0) > 0 then
    v_authorizer := public.authorize_action('apply_discount', p_override_grant);
    -- Admins (or an admin's PIN) can exceed the staff discount limit
    v_max := case when exists (select 1 from public.profiles where id = v_authorizer and role = 'admin')
                  then null else s.max_staff_discount_percent end;
  end if;

  if p_customer_id is not null then
    select coalesce(nullif(v_customer_name, ''), full_name) into v_customer_name
      from public.profiles where id = p_customer_id and role = 'customer' and is_active;
    if not found then raise exception 'Customer account not found.'; end if;
  end if;

  o := public.create_order_internal('pos', p_customer_id, coalesce(v_customer_name, ''), p_service_type, p_items,
    p_payment_method, p_notes, p_promo_code, p_redemption_code, p_discount_type, p_discount_value,
    p_discount_reason, v_authorizer, v_max, v_uid, p_idempotency_key);

  if v_pm.is_cash then
    if p_amount_tendered is null or p_amount_tendered < o.total then
      raise exception 'Cash received (₱%) is less than the total (₱%).',
        to_char(coalesce(p_amount_tendered, 0), 'FM999,990.00'), to_char(o.total, 'FM999,990.00');
    end if;
    v_change := p_amount_tendered - o.total;
  elsif v_pm.requires_reference and coalesce(trim(p_payment_reference), '') = '' then
    raise exception 'Enter the % reference number.', v_pm.name;
  end if;

  insert into public.payments (order_id, method_code, amount, amount_tendered, change_given,
    reference_no, status, received_by, verified_at)
  values (o.id, v_pm.code, o.total, case when v_pm.is_cash then p_amount_tendered end, v_change,
    left(trim(coalesce(p_payment_reference, '')), 60), 'verified', v_uid, now());
  update public.orders set payment_status = 'paid' where id = o.id;

  perform public.transition_order(o.id, 'confirmed', 'Paid at POS');
  if p_complete_now then
    perform public.transition_order(o.id, 'completed', 'Served at POS');
  end if;

  if o.discount_total > 0 and p_discount_type is not null then
    perform public.log_audit('order.discount', 'order', o.id::text, jsonb_build_object(
      'order_number', o.order_number, 'amount', o.discount_total, 'reason', p_discount_reason,
      'authorized_by', v_authorizer));
  end if;

  return jsonb_build_object('order_id', o.id, 'order_number', o.order_number, 'total', o.total,
    'change', v_change, 'replayed', false);
end $$;

-- ---------------------------------------------------------------------------
-- Staff: payments for online orders
-- ---------------------------------------------------------------------------
create or replace function public.record_order_payment(
  p_order_id uuid, p_method text, p_amount_tendered numeric, p_reference text
) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := public.assert_staff();
  o public.orders;
  v_pm public.payment_methods;
  v_change numeric := 0;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found.'; end if;
  if o.payment_status = 'paid' then
    return jsonb_build_object('ok', true, 'change', 0, 'already_paid', true);
  end if;
  if o.status = 'cancelled' then raise exception 'This order was cancelled.'; end if;
  select * into v_pm from public.payment_methods where code = p_method and is_active and allow_pos;
  if not found then raise exception 'That payment method is not available.'; end if;
  if v_pm.is_cash then
    if p_amount_tendered is null or p_amount_tendered < o.total then
      raise exception 'Cash received is less than the total.';
    end if;
    v_change := p_amount_tendered - o.total;
  elsif v_pm.requires_reference and coalesce(trim(p_reference), '') = '' then
    raise exception 'Enter the payment reference number.';
  end if;
  -- Any pending digital payment is superseded
  update public.payments set status = 'rejected' where order_id = o.id and status = 'pending';
  insert into public.payments (order_id, method_code, amount, amount_tendered, change_given, reference_no,
    status, received_by, verified_at)
  values (o.id, v_pm.code, o.total, case when v_pm.is_cash then p_amount_tendered end, v_change,
    left(trim(coalesce(p_reference, '')), 60), 'verified', v_uid, now());
  update public.orders set payment_status = 'paid', payment_method_code = v_pm.code where id = o.id;
  perform public.log_audit('payment.record', 'order', o.id::text,
    jsonb_build_object('order_number', o.order_number, 'method', v_pm.code, 'amount', o.total));
  return jsonb_build_object('ok', true, 'change', v_change);
end $$;

create or replace function public.verify_payment(p_payment_id uuid, p_approve boolean, p_note text)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := public.assert_staff();
  v_pay public.payments;
  o public.orders;
begin
  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found then raise exception 'Payment not found.'; end if;
  if v_pay.status <> 'pending' then raise exception 'This payment was already reviewed.'; end if;
  select * into o from public.orders where id = v_pay.order_id for update;
  if p_approve then
    if o.payment_status = 'paid' then raise exception 'This order is already paid.'; end if;
    update public.payments set status = 'verified', verified_at = now(), received_by = v_uid where id = v_pay.id;
    update public.orders set payment_status = 'paid' where id = o.id;
  else
    update public.payments set status = 'rejected', verified_at = now(), received_by = v_uid where id = v_pay.id;
    update public.orders set payment_status = 'unpaid' where id = o.id;
  end if;
  perform public.log_audit(case when p_approve then 'payment.verify' else 'payment.reject' end, 'order', o.id::text,
    jsonb_build_object('order_number', o.order_number, 'reference', v_pay.reference_no, 'amount', v_pay.amount, 'note', p_note));
end $$;

-- ---------------------------------------------------------------------------
-- Staff: status updates, voids and refunds
-- ---------------------------------------------------------------------------
create or replace function public.update_order_status(
  p_order_id uuid, p_status public.order_status, p_note text, p_override_grant uuid
) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := public.assert_staff();
  o public.orders;
  v_authorizer uuid;
  v_refund_id uuid;
  v_amount numeric;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found.'; end if;

  if p_status = 'cancelled' and o.status <> 'cancelled' then
    if coalesce(trim(p_note), '') = '' then raise exception 'Please give a reason for cancelling.'; end if;
    if o.payment_status in ('paid', 'partially_refunded') then
      -- Cancelling a paid order is a void: the money goes back to the customer
      v_authorizer := public.authorize_action('void_order', p_override_grant);
      v_amount := o.total - o.refunded_total;
      insert into public.refunds (order_id, kind, amount, reason, restocked, processed_by, authorized_by)
      values (o.id, 'void', v_amount, p_note,
              (select restock_on_cancel from public.store_settings where id) and o.inventory_deducted_at is not null,
              v_uid, v_authorizer)
      returning id into v_refund_id;
      update public.order_items set refunded_quantity = quantity where order_id = o.id;
      update public.orders set refunded_total = total, payment_status = 'refunded' where id = o.id;
      perform public.log_audit('order.void', 'order', o.id::text, jsonb_build_object(
        'order_number', o.order_number, 'amount', v_amount, 'reason', p_note, 'authorized_by', v_authorizer));
    else
      perform public.log_audit('order.cancel', 'order', o.id::text, jsonb_build_object(
        'order_number', o.order_number, 'reason', p_note));
    end if;
    -- A pending digital payment that was never verified is simply rejected
    update public.payments set status = 'rejected' where order_id = o.id and status = 'pending';
    if o.payment_status = 'pending_verification' then
      update public.orders set payment_status = 'unpaid' where id = o.id;
    end if;
  end if;

  o := public.transition_order(p_order_id, p_status, p_note);
  return jsonb_build_object('status', o.status);
end $$;

create or replace function public.refund_order(
  p_order_id uuid, p_items jsonb, p_reason text, p_restock boolean, p_override_grant uuid
) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := public.assert_staff();
  o public.orders;
  v_authorizer uuid;
  v_refund_id uuid := gen_random_uuid();
  v_line jsonb;
  oi public.order_items;
  v_qty integer;
  v_items_value numeric := 0;
  v_amount numeric;
  v_ratio numeric;
  v_points integer := 0;
  v_req record;
  v_full boolean;
begin
  v_authorizer := public.authorize_action('refund_order', p_override_grant);
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found.'; end if;
  if o.status <> 'completed' then
    raise exception 'Only completed orders can be refunded. Cancel open orders instead.';
  end if;
  if o.payment_status not in ('paid', 'partially_refunded') then
    raise exception 'This order has nothing left to refund.';
  end if;
  if coalesce(trim(p_reason), '') = '' or length(trim(p_reason)) < 3 then
    raise exception 'Please give a reason for the refund.';
  end if;

  insert into public.refunds (id, order_id, kind, amount, reason, restocked, processed_by, authorized_by)
  values (v_refund_id, o.id, 'refund', 0, trim(p_reason), coalesce(p_restock, false), v_uid, v_authorizer);

  -- Default: refund everything that has not been refunded yet
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    select coalesce(jsonb_agg(jsonb_build_object('order_item_id', id, 'quantity', quantity - refunded_quantity)), '[]'::jsonb)
      into p_items from public.order_items where order_id = o.id and quantity > refunded_quantity;
  end if;

  for v_line in select * from jsonb_array_elements(p_items) loop
    select * into oi from public.order_items
     where id = public.try_uuid(v_line ->> 'order_item_id') and order_id = o.id for update;
    if not found then raise exception 'Item does not belong to this order.'; end if;
    v_qty := (v_line ->> 'quantity')::integer;
    if v_qty is null or v_qty < 1 or v_qty > oi.quantity - oi.refunded_quantity then
      raise exception 'Invalid refund quantity for %.', oi.product_name;
    end if;
    update public.order_items set refunded_quantity = refunded_quantity + v_qty where id = oi.id;
    insert into public.refund_items (refund_id, order_item_id, quantity, amount)
    values (v_refund_id, oi.id, v_qty, oi.unit_price * v_qty);
    v_items_value := v_items_value + oi.unit_price * v_qty;
    if oi.points_eligible then v_points := v_points + oi.points_per_unit * v_qty; end if;

    if coalesce(p_restock, false) and o.inventory_deducted_at is not null then
      for v_req in
        select req.inventory_item_id, req.quantity from public.recipes r
         cross join lateral public.recipe_requirements(r.id, v_qty, o.service_type) req
         where r.product_id = oi.product_id
      loop
        perform public.apply_stock_movement(v_req.inventory_item_id, 'sale_reversal', v_req.quantity, null,
          o.id, v_refund_id, null, 'Refund restock ' || o.order_number);
      end loop;
    end if;
  end loop;

  if v_items_value = 0 then raise exception 'Select at least one item to refund.'; end if;

  v_full := not exists (select 1 from public.order_items where order_id = o.id and quantity > refunded_quantity);
  if v_full then
    v_amount := o.total - o.refunded_total; -- includes packaging, net of discounts
  else
    v_ratio := case when o.subtotal > 0 then (o.subtotal - o.discount_total) / o.subtotal else 0 end;
    v_amount := least(round(v_items_value * v_ratio, 2), o.total - o.refunded_total);
  end if;

  -- Take back points that were earned on the refunded meals
  if o.points_awarded_at is not null and v_points > 0 then
    perform public.add_ledger_entry(o.customer_id, -v_points, 'earn_reversal',
      'Refund on order ' || o.order_number, 'refund:' || v_refund_id, o.id, v_refund_id);
  else
    v_points := 0;
  end if;

  update public.refunds set amount = v_amount, points_reversed = v_points where id = v_refund_id;
  update public.orders
     set refunded_total = refunded_total + v_amount,
         payment_status = case when v_full then 'refunded'::public.payment_status else 'partially_refunded' end
   where id = o.id;
  perform public.log_audit('order.refund', 'order', o.id::text, jsonb_build_object(
    'order_number', o.order_number, 'amount', v_amount, 'reason', p_reason, 'restock', p_restock,
    'points_reversed', v_points, 'authorized_by', v_authorizer));
  return jsonb_build_object('refund_id', v_refund_id, 'amount', v_amount, 'points_reversed', v_points);
end $$;

-- Staff can mark items sold out / back in stock during service
create or replace function public.set_product_availability(p_product_id uuid, p_available boolean)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  perform public.assert_staff();
  update public.products set is_available = p_available where id = p_product_id;
  if not found then raise exception 'Product not found.'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Rewards
-- ---------------------------------------------------------------------------
create or replace function public.issue_redemption(
  p_reward public.rewards, p_customer_id uuid, p_source text, p_points integer
) returns public.reward_redemptions language plpgsql volatile security definer set search_path = public as $$
declare
  r public.reward_redemptions;
  v_code text;
begin
  loop
    v_code := 'JK-' || public.random_code(4) || '-' || public.random_code(4);
    exit when not exists (select 1 from public.reward_redemptions where code = v_code);
  end loop;
  insert into public.reward_redemptions (reward_id, customer_id, code, source, points_spent, expires_at)
  values (p_reward.id, p_customer_id, v_code, p_source, p_points,
          least(now() + make_interval(days => p_reward.valid_days), coalesce(p_reward.expires_at, 'infinity'::timestamptz)))
  returning * into r;
  return r;
end $$;

create or replace function public.redeem_reward(p_reward_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := public.assert_signed_in();
  v_profile public.profiles;
  v_reward public.rewards;
  r public.reward_redemptions;
begin
  select * into v_profile from public.profiles where id = v_uid for update; -- serializes redemptions
  select * into v_reward from public.rewards where id = p_reward_id for update;
  if not found or not v_reward.is_active or not v_reward.is_redeemable
     or (v_reward.expires_at is not null and v_reward.expires_at <= now()) then
    raise exception 'This reward is not available.';
  end if;
  if v_reward.points_cost <= 0 then raise exception 'This reward cannot be redeemed with points.'; end if;
  if v_profile.points_balance < v_reward.points_cost then
    raise exception 'You need % more points for this reward.', v_reward.points_cost - v_profile.points_balance;
  end if;
  if v_reward.per_customer_limit is not null and (
     select count(*) from public.reward_redemptions
      where reward_id = v_reward.id and customer_id = v_uid and status <> 'cancelled') >= v_reward.per_customer_limit then
    raise exception 'You have reached the redemption limit for this reward.';
  end if;
  if v_reward.total_limit is not null and (
     select count(*) from public.reward_redemptions where reward_id = v_reward.id and status <> 'cancelled') >= v_reward.total_limit then
    raise exception 'This reward has run out.';
  end if;

  r := public.issue_redemption(v_reward, v_uid, 'points', v_reward.points_cost);
  perform public.add_ledger_entry(v_uid, -v_reward.points_cost, 'redeem', 'Redeemed ' || v_reward.name,
    'redeem:' || r.id, null, null, r.id);
  return jsonb_build_object('redemption_id', r.id, 'code', r.code, 'expires_at', r.expires_at);
end $$;

create or replace function public.cancel_redemption(p_redemption_id uuid, p_reason text)
returns void language plpgsql volatile security definer set search_path = public as $$
declare r public.reward_redemptions;
begin
  perform public.assert_admin();
  select * into r from public.reward_redemptions where id = p_redemption_id for update;
  if not found then raise exception 'Redemption not found.'; end if;
  if r.status <> 'issued' then raise exception 'Only unused codes can be cancelled.'; end if;
  update public.reward_redemptions set status = 'cancelled' where id = r.id;
  if r.points_spent > 0 then
    perform public.add_ledger_entry(r.customer_id, r.points_spent, 'redeem_reversal',
      'Reward code ' || r.code || ' cancelled', 'redeem:' || r.id || ':reversal', null, null, r.id);
  end if;
  perform public.log_audit('redemption.cancel', 'reward_redemption', r.id::text,
    jsonb_build_object('code', r.code, 'reason', p_reason));
end $$;

-- Staff: look up a code before applying it
create or replace function public.lookup_redemption(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  r public.reward_redemptions;
  w public.rewards;
  c public.profiles;
begin
  perform public.assert_staff();
  select * into r from public.reward_redemptions where code = upper(trim(p_code));
  if not found then return jsonb_build_object('found', false); end if;
  select * into w from public.rewards where id = r.reward_id;
  select * into c from public.profiles where id = r.customer_id;
  return jsonb_build_object(
    'found', true, 'id', r.id, 'code', r.code,
    'status', case when r.status = 'issued' and r.expires_at <= now() then 'expired' else r.status::text end,
    'reward_name', w.name, 'reward_type', w.reward_type, 'value', w.value, 'product_id', w.product_id,
    'product_name', (select name from public.products where id = w.product_id),
    'customer_id', c.id, 'customer_name', c.full_name, 'expires_at', r.expires_at, 'used_at', r.used_at,
    'order_number', (select order_number from public.orders where id = r.order_id));
end $$;

-- Staff: hand out a reward without a sale (e.g. a free drink at the counter)
create or replace function public.use_redemption_at_counter(p_code text, p_note text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := public.assert_staff();
  r public.reward_redemptions;
begin
  select * into r from public.reward_redemptions where code = upper(trim(p_code)) for update;
  if not found then raise exception 'Reward code not found.'; end if;
  if r.status <> 'issued' then raise exception 'This code was already used or cancelled.'; end if;
  if r.expires_at <= now() then raise exception 'This code has expired.'; end if;
  update public.reward_redemptions set status = 'used', used_at = now(), used_by = v_uid where id = r.id;
  perform public.log_audit('redemption.use', 'reward_redemption', r.id::text,
    jsonb_build_object('code', r.code, 'note', p_note));
  return jsonb_build_object('ok', true);
end $$;

-- Admin: manual points adjustment (goodwill, corrections)
create or replace function public.admin_adjust_points(p_customer_id uuid, p_points integer, p_reason text)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  perform public.assert_admin();
  if coalesce(p_points, 0) = 0 then raise exception 'Enter a non-zero amount.'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required.'; end if;
  if not exists (select 1 from public.profiles where id = p_customer_id) then raise exception 'Customer not found.'; end if;
  perform public.add_ledger_entry(p_customer_id, p_points, 'admin_adjustment', trim(p_reason),
    'adjust:' || gen_random_uuid());
  perform public.log_audit('points.adjust', 'profile', p_customer_id::text,
    jsonb_build_object('points', p_points, 'reason', p_reason));
end $$;

-- Admin: roles and permissions
create or replace function public.admin_set_user_access(
  p_user_id uuid, p_role public.app_role, p_permissions text[], p_is_active boolean
) returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_old public.profiles;
  v_perms text[];
begin
  perform public.assert_admin();
  select * into v_old from public.profiles where id = p_user_id for update;
  if not found then raise exception 'User not found.'; end if;
  if p_user_id = auth.uid() and (p_role <> 'admin' or not p_is_active) then
    raise exception 'You cannot remove your own admin access.';
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_perms
    from unnest(coalesce(p_permissions, '{}')) x
   where x in ('apply_discount', 'void_order', 'refund_order', 'view_sales');
  update public.profiles
     set role = p_role,
         permissions = case when p_role = 'staff' then v_perms else '{}' end,
         is_active = p_is_active
   where id = p_user_id;
  if p_role = 'customer' then
    delete from public.staff_pins where profile_id = p_user_id;
  end if;
  perform public.log_audit('user.access', 'profile', p_user_id::text, jsonb_build_object(
    'email', v_old.email, 'from_role', v_old.role, 'to_role', p_role,
    'permissions', v_perms, 'is_active', p_is_active));
end $$;

-- ---------------------------------------------------------------------------
-- Price quote: runs the real order logic in a subtransaction and rolls it
-- back, so the totals shown at checkout always match what will be charged.
-- ---------------------------------------------------------------------------
create or replace function public.quote_order(
  p_channel public.order_channel, p_items jsonb, p_service_type public.service_type,
  p_payment_method text, p_promo_code text, p_redemption_code text
) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid;
  o public.orders;
  v_result jsonb;
begin
  if p_channel = 'pos' then
    v_uid := public.assert_staff();
  else
    v_uid := public.assert_signed_in();
  end if;
  begin
    o := public.create_order_internal(p_channel, case when p_channel = 'online' then v_uid end, '', p_service_type,
      p_items, p_payment_method, '', p_promo_code, p_redemption_code, null, null, null, null, null,
      case when p_channel = 'pos' then v_uid end, 'quote-' || gen_random_uuid());
    select jsonb_build_object(
      'ok', true, 'subtotal', o.subtotal, 'packaging_fee', o.packaging_fee, 'discount_total', o.discount_total,
      'total', o.total, 'discount_reason', o.discount_reason,
      'points', (select coalesce(sum(points_per_unit * quantity), 0) from public.order_items where order_id = o.id and points_eligible),
      'lines', (select coalesce(jsonb_agg(jsonb_build_object('product_id', product_id, 'name', product_name,
                  'unit_price', unit_price, 'quantity', quantity, 'line_total', line_total,
                  'is_addon', parent_item_id is not null, 'points', points_per_unit * quantity) order by created_at), '[]'::jsonb)
                from public.order_items where order_id = o.id))
      into v_result;
    raise exception using message = 'QUOTE_ROLLBACK', errcode = 'JK001';
  exception
    when sqlstate 'JK001' then
      return v_result;
    when raise_exception then
      return jsonb_build_object('ok', false, 'error', sqlerrm);
  end;
end $$;
