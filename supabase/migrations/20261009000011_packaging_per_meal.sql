-- Takeout packaging fee becomes per meal instead of per order.
-- store_settings.takeout_packaging_fee is now the amount per meal (₱5 → 3 meals = ₱15).
-- Only the packaging line of create_order_internal changes; quote_order and both
-- order paths (online + POS) call this function, so they all follow automatically.

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
  -- Takeout packaging is charged per meal: every unit of a top-level item that is
  -- not in an add-on category (drinks, extra rice, egg, gravy don't count)
  if p_service = 'takeout' then
    v_pack := s.takeout_packaging_fee * coalesce((
      select sum(oi.quantity)
        from public.order_items oi
        join public.products pr on pr.id = oi.product_id
        join public.categories c on c.id = pr.category_id
       where oi.order_id = v_order_id and oi.parent_item_id is null and not c.is_addon_category), 0);
  end if;

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
