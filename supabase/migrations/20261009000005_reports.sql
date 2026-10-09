-- =============================================================================
-- Java Kubo — reporting functions (Asia/Manila calendar days)
--
-- Definitions used everywhere:
--   Gross sales   = subtotal + packaging fees of completed orders
--   Net sales     = gross sales − discounts − refunds
--   COGS          = Σ order_items.unit_cost snapshot × quantity kept (not refunded)
--   Gross profit  = net sales − COGS              (estimated food gross profit)
--   Net operating = gross profit − operating expenses (estimated, before tax)
-- Sales are dated by completion time; expenses by expense_date.
-- =============================================================================

create or replace function public.assert_report_access(p_from date, p_to date)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if public.is_admin() then return; end if;
  if public.has_permission('view_sales') and p_from = public.manila_today() and p_to = public.manila_today() then
    return;
  end if;
  raise exception 'You do not have access to these reports.';
end $$;

create or replace function public.report_summary(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  perform public.assert_report_access(p_from, p_to);
  with o as (
    select * from public.orders
     where status = 'completed' and public.manila_date(completed_at) between p_from and p_to
  ), totals as (
    select count(*) as orders,
           coalesce(sum(subtotal + packaging_fee), 0) as gross,
           coalesce(sum(discount_total), 0) as discounts,
           coalesce(sum(refunded_total), 0) as refunds,
           coalesce(sum(packaging_fee), 0) as packaging,
           count(*) filter (where service_type = 'dine_in') as dine_in_orders,
           count(*) filter (where service_type = 'takeout') as takeout_orders,
           coalesce(sum(total - refunded_total) filter (where service_type = 'dine_in'), 0) as dine_in_sales,
           coalesce(sum(total - refunded_total) filter (where service_type = 'takeout'), 0) as takeout_sales,
           count(*) filter (where channel = 'online') as online_orders,
           count(*) filter (where channel = 'pos') as pos_orders
      from o
  ), cogs as (
    select coalesce(sum(oi.unit_cost * (oi.quantity - oi.refunded_quantity)), 0) as cogs
      from public.order_items oi join o on o.id = oi.order_id
  ), pay as (
    select coalesce(jsonb_agg(jsonb_build_object('method', pm.name, 'code', pm.code, 'is_cash', pm.is_cash,
             'amount', x.amount, 'count', x.cnt) order by x.amount desc), '[]'::jsonb) as by_method,
           coalesce(sum(x.amount) filter (where pm.is_cash), 0) as cash,
           coalesce(sum(x.amount) filter (where not pm.is_cash), 0) as digital
      from (select p.method_code, sum(p.amount) as amount, count(*) as cnt
              from public.payments p join o on o.id = p.order_id
             where p.status = 'verified' group by p.method_code) x
      join public.payment_methods pm on pm.code = x.method_code
  ), voids as (
    select count(*) as cnt, coalesce(sum(amount), 0) as amount from public.refunds
     where kind = 'void' and public.manila_date(created_at) between p_from and p_to
  ), cancels as (
    select count(*) as cnt from public.orders
     where status = 'cancelled' and public.manila_date(cancelled_at) between p_from and p_to
  ), exp as (
    select coalesce(sum(amt), 0) as total,
           coalesce(sum(amt) filter (where category = 'labor'), 0) as labor,
           coalesce(jsonb_object_agg(category, amt), '{}'::jsonb) as by_category
      from (select category, sum(amount) as amt from public.operating_expenses
             where expense_date between p_from and p_to group by category) e
  ), open_orders as (
    select count(*) as cnt from public.orders where status in ('pending', 'confirmed', 'preparing', 'ready')
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'orders', t.orders,
    'gross_sales', t.gross,
    'discounts', t.discounts,
    'refunds', t.refunds,
    'net_sales', t.gross - t.discounts - t.refunds,
    'packaging_fees', t.packaging,
    'average_order_value', case when t.orders > 0 then round((t.gross - t.discounts - t.refunds) / t.orders, 2) else 0 end,
    'dine_in_orders', t.dine_in_orders, 'takeout_orders', t.takeout_orders,
    'dine_in_sales', t.dine_in_sales, 'takeout_sales', t.takeout_sales,
    'online_orders', t.online_orders, 'pos_orders', t.pos_orders,
    'cash_received', pay.cash, 'digital_received', pay.digital, 'payments_by_method', pay.by_method,
    'cogs', round(c.cogs, 2),
    'gross_profit', round(t.gross - t.discounts - t.refunds - c.cogs, 2),
    'gross_margin', case when t.gross - t.discounts - t.refunds > 0
                         then round((t.gross - t.discounts - t.refunds - c.cogs) / (t.gross - t.discounts - t.refunds) * 100, 1) else 0 end,
    'expenses', exp.total, 'labor_cost', exp.labor, 'expenses_by_category', exp.by_category,
    'net_operating_profit', round(t.gross - t.discounts - t.refunds - c.cogs - exp.total, 2),
    'voids_count', voids.cnt, 'voids_amount', voids.amount, 'cancelled_orders', cancels.cnt,
    'open_orders', open_orders.cnt
  ) into v
  from totals t, cogs c, pay, voids, cancels, exp, open_orders;
  return v;
end $$;

create or replace function public.report_daily_sales(p_from date, p_to date)
returns table (day date, orders bigint, gross_sales numeric, discounts numeric, refunds numeric,
               net_sales numeric, cogs numeric, gross_profit numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_report_access(p_from, p_to);
  return query
    with days as (select generate_series(p_from, p_to, interval '1 day')::date as d),
    o as (
      select public.manila_date(completed_at) as d, id, subtotal, packaging_fee, discount_total, refunded_total
        from public.orders where status = 'completed' and public.manila_date(completed_at) between p_from and p_to
    ),
    agg as (
      select o.d, count(*) as orders, sum(subtotal + packaging_fee) as gross, sum(discount_total) as disc,
             sum(refunded_total) as refunds,
             sum((select coalesce(sum(oi.unit_cost * (oi.quantity - oi.refunded_quantity)), 0)
                    from public.order_items oi where oi.order_id = o.id)) as cogs
        from o group by o.d
    )
    select days.d, coalesce(a.orders, 0), coalesce(a.gross, 0), coalesce(a.disc, 0), coalesce(a.refunds, 0),
           coalesce(a.gross - a.disc - a.refunds, 0), round(coalesce(a.cogs, 0), 2),
           round(coalesce(a.gross - a.disc - a.refunds - a.cogs, 0), 2)
      from days left join agg a on a.d = days.d order by days.d;
end $$;

create or replace function public.report_product_sales(p_from date, p_to date)
returns table (product_id uuid, product_name text, category_name text, quantity bigint,
               revenue numeric, cost numeric, gross_profit numeric, margin numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_report_access(p_from, p_to);
  return query
    select oi.product_id, max(oi.product_name), max(oi.category_name),
           sum(oi.quantity - oi.refunded_quantity)::bigint,
           sum(oi.unit_price * (oi.quantity - oi.refunded_quantity)),
           round(sum(oi.unit_cost * (oi.quantity - oi.refunded_quantity)), 2),
           round(sum((oi.unit_price - oi.unit_cost) * (oi.quantity - oi.refunded_quantity)), 2),
           case when sum(oi.unit_price * (oi.quantity - oi.refunded_quantity)) > 0
                then round(sum((oi.unit_price - oi.unit_cost) * (oi.quantity - oi.refunded_quantity))
                           / sum(oi.unit_price * (oi.quantity - oi.refunded_quantity)) * 100, 1) else 0 end
      from public.order_items oi join public.orders o on o.id = oi.order_id
     where o.status = 'completed' and public.manila_date(o.completed_at) between p_from and p_to
     group by oi.product_id
     order by 4 desc, 5 desc;
end $$;

create or replace function public.report_ingredient_usage(p_from date, p_to date)
returns table (inventory_item_id uuid, item_name text, unit public.stock_unit, used numeric,
               used_cost numeric, purchased numeric, purchased_cost numeric, wasted numeric, wasted_cost numeric,
               adjusted numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_admin();
  return query
    select i.id, i.name, i.unit,
           round(coalesce(-sum(m.quantity) filter (where m.movement_type in ('sale', 'sale_reversal')), 0), 3),
           round(coalesce(sum(case when m.movement_type = 'sale' then m.total_cost
                                    when m.movement_type = 'sale_reversal' then -m.total_cost end), 0), 2),
           round(coalesce(sum(m.quantity) filter (where m.movement_type in ('purchase', 'opening')), 0), 3),
           round(coalesce(sum(m.total_cost) filter (where m.movement_type in ('purchase', 'opening')), 0), 2),
           round(coalesce(-sum(m.quantity) filter (where m.movement_type = 'spoilage'), 0), 3),
           round(coalesce(sum(m.total_cost) filter (where m.movement_type = 'spoilage'), 0), 2),
           round(coalesce(sum(m.quantity) filter (where m.movement_type in ('adjustment', 'count')), 0), 3)
      from public.inventory_items i
      join public.inventory_movements m on m.inventory_item_id = i.id
     where public.manila_date(m.created_at) between p_from and p_to
     group by i.id, i.name, i.unit
     order by 5 desc;
end $$;

create or replace function public.report_staff_summary(p_from date, p_to date)
returns table (staff_id uuid, staff_name text, role public.app_role, orders bigint, sales numeric,
               discounts numeric, voids bigint, void_amount numeric, refunds bigint, refund_amount numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_admin();
  return query
    with s as (
      select o.staff_id, count(*) as orders, sum(o.total - o.refunded_total) as sales, sum(o.discount_total) as disc
        from public.orders o
       where o.channel = 'pos' and o.status = 'completed' and public.manila_date(o.completed_at) between p_from and p_to
       group by o.staff_id
    ), r as (
      select processed_by,
             count(*) filter (where kind = 'void') as voids, coalesce(sum(amount) filter (where kind = 'void'), 0) as void_amt,
             count(*) filter (where kind = 'refund') as refunds, coalesce(sum(amount) filter (where kind = 'refund'), 0) as refund_amt
        from public.refunds where public.manila_date(created_at) between p_from and p_to
       group by processed_by
    )
    select p.id, p.full_name, p.role, coalesce(s.orders, 0), coalesce(s.sales, 0), coalesce(s.disc, 0),
           coalesce(r.voids, 0), coalesce(r.void_amt, 0), coalesce(r.refunds, 0), coalesce(r.refund_amt, 0)
      from public.profiles p
      left join s on s.staff_id = p.id
      left join r on r.processed_by = p.id
     where p.role in ('admin', 'staff') and (s.staff_id is not null or r.processed_by is not null)
     order by 5 desc;
end $$;

create or replace function public.report_loyalty(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  perform public.assert_admin();
  select jsonb_build_object(
    'points_earned', coalesce(sum(points) filter (where entry_type = 'earn'), 0),
    'points_from_games', coalesce(sum(points) filter (where entry_type = 'game_reward'), 0),
    'points_redeemed', coalesce(-sum(points) filter (where entry_type = 'redeem'), 0),
    'points_reversed', coalesce(-sum(points) filter (where entry_type in ('earn_reversal', 'redeem_reversal')), 0),
    'points_adjusted', coalesce(sum(points) filter (where entry_type = 'admin_adjustment'), 0),
    'outstanding_balance', (select coalesce(sum(points_balance), 0) from public.profiles),
    'redemptions_issued', (select count(*) from public.reward_redemptions
                            where public.manila_date(created_at) between p_from and p_to),
    'redemptions_used', (select count(*) from public.reward_redemptions
                          where status = 'used' and public.manila_date(used_at) between p_from and p_to),
    'reward_discounts', (select coalesce(sum(discount_applied), 0) from public.reward_redemptions
                          where status = 'used' and public.manila_date(used_at) between p_from and p_to),
    'game_rounds', (select count(*) from public.game_sessions
                     where public.manila_date(started_at) between p_from and p_to),
    'game_rewards', (select coalesce(jsonb_agg(jsonb_build_object('game', g.name, 'rounds', x.rounds,
                       'points', x.points, 'coupons', x.coupons) order by g.sort_order), '[]'::jsonb)
                      from public.games g
                      left join lateral (
                        select count(distinct gs.id) as rounds, coalesce(sum(gr.points), 0) as points,
                               count(gr.redemption_id) as coupons
                          from public.game_sessions gs left join public.game_rewards gr on gr.session_id = gs.id
                         where gs.game_code = g.code and public.manila_date(gs.started_at) between p_from and p_to
                      ) x on true)
  ) into v
  from public.loyalty_ledger where public.manila_date(created_at) between p_from and p_to;
  return v;
end $$;

create or replace function public.report_top_customers(p_from date, p_to date, p_limit integer default 10)
returns table (customer_id uuid, full_name text, email text, orders bigint, spent numeric, points_balance integer)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_admin();
  return query
    select p.id, p.full_name, p.email, count(o.id), coalesce(sum(o.total - o.refunded_total), 0), p.points_balance
      from public.orders o join public.profiles p on p.id = o.customer_id
     where o.status = 'completed' and public.manila_date(o.completed_at) between p_from and p_to
     group by p.id
     order by 4 desc, 5 desc
     limit least(greatest(p_limit, 1), 100);
end $$;

-- Inventory valuation and alerts
create or replace function public.inventory_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_admin();
  return jsonb_build_object(
    'stock_value', (select coalesce(round(sum(greatest(current_stock, 0) * avg_cost), 2), 0)
                      from public.inventory_items where not is_archived),
    'low_stock', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'unit', unit,
                     'current_stock', current_stock, 'min_stock', min_stock) order by current_stock / nullif(min_stock, 0)), '[]'::jsonb)
                    from public.inventory_items where not is_archived and current_stock <= min_stock),
    'expiring', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name,
                    'expiration_date', expiration_date) order by expiration_date), '[]'::jsonb)
                   from public.inventory_items
                  where not is_archived and expiration_date is not null
                    and expiration_date <= public.manila_today() + 7 and current_stock > 0)
  );
end $$;

-- Limited dashboard for staff with the view_sales permission (today only)
create or replace function public.staff_today_summary()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  return public.report_summary(public.manila_today(), public.manila_today());
end $$;
