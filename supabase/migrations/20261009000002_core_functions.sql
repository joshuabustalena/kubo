-- =============================================================================
-- Java Kubo — core helpers, auth/role helpers, audit, units, costing, stock
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Small utilities
-- ---------------------------------------------------------------------------
create or replace function public.manila_today()
returns date language sql stable as $$
  select (now() at time zone 'Asia/Manila')::date
$$;

create or replace function public.manila_date(ts timestamptz)
returns date language sql immutable as $$
  select (ts at time zone 'Asia/Manila')::date
$$;

create or replace function public.try_uuid(p text)
returns uuid language plpgsql immutable as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

-- Human-friendly random code without ambiguous characters (no 0/O/1/I)
create or replace function public.random_code(p_len integer)
returns text language plpgsql volatile set search_path = public, extensions as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea := gen_random_bytes(p_len);
  result text := '';
begin
  for i in 0 .. p_len - 1 loop
    result := result || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  return result;
end $$;

create or replace function public.next_counter(p_counter text)
returns integer language sql volatile security definer set search_path = public as $$
  insert into public.daily_counters (counter, day, last_value)
  values (p_counter, public.manila_today(), 1)
  on conflict (counter, day) do update set last_value = daily_counters.last_value + 1
  returning last_value
$$;

create or replace function public.next_order_number()
returns text language sql volatile security definer set search_path = public as $$
  select 'JK-' || to_char(public.manila_today(), 'YYMMDD') || '-' ||
         lpad(public.next_counter('order')::text, 4, '0')
$$;

-- ---------------------------------------------------------------------------
-- Role helpers (used by RLS policies and RPCs)
-- ---------------------------------------------------------------------------
create or replace function public.current_app_role()
returns public.app_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_app_role() = 'admin', false)
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_app_role() in ('admin', 'staff'), false)
$$;

create or replace function public.has_permission(p_permission text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.role = 'admin' or (p.role = 'staff' and p_permission = any (p.permissions))
    from public.profiles p where p.id = auth.uid() and p.is_active
  ), false)
$$;

create or replace function public.assert_signed_in()
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (select 1 from public.profiles where id = v_uid and is_active) then
    raise exception 'Please log in to continue.';
  end if;
  return v_uid;
end $$;

create or replace function public.assert_staff()
returns uuid language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then
    raise exception 'Staff access required.';
  end if;
  return auth.uid();
end $$;

create or replace function public.assert_admin()
returns uuid language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required.';
  end if;
  return auth.uid();
end $$;

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------
create or replace function public.log_audit(
  p_action text, p_entity_type text, p_entity_id text, p_details jsonb default '{}'::jsonb
) returns void language sql volatile security definer set search_path = public as $$
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_details, '{}'::jsonb))
$$;

-- Generic change auditing for admin-managed tables. Records only changed columns.
create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_changes jsonb := '{}'::jsonb;
  v_key text;
  v_ignore text[] := array['updated_at', 'current_stock', 'avg_cost', 'last_purchase_cost', 'points_balance'];
  v_id text;
begin
  if tg_op = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_new) loop
      if v_key <> all (v_ignore) and (v_old -> v_key) is distinct from (v_new -> v_key) then
        v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object('from', v_old -> v_key, 'to', v_new -> v_key));
      end if;
    end loop;
    if v_changes = '{}'::jsonb then
      return new;
    end if;
  elsif tg_op = 'INSERT' then
    v_changes := v_new;
  else
    v_changes := v_old;
  end if;
  v_id := coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'code', v_old ->> 'code');
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
  values (auth.uid(), lower(tg_op), tg_table_name, v_id, v_changes);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'store_settings', 'categories', 'products', 'product_addons', 'suppliers', 'inventory_items',
    'recipes', 'recipe_ingredients', 'payment_methods', 'promotions', 'rewards', 'games',
    'game_prizes', 'quiz_questions', 'operating_expenses'
  ] loop
    execute format(
      'create trigger trg_%1$s_audit after insert or update or delete on public.%1$I
         for each row execute function public.audit_row_change()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Profiles: auto-create on sign-up, protect privileged columns
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)), 120)
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_email_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = coalesce(new.email, '') where id = new.id;
  end if;
  return new;
end $$;

create trigger on_auth_user_email_changed after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- Direct client updates (role "authenticated") may only touch personal fields.
-- Role/permission changes go through admin_set_user_access(); points only
-- change through the loyalty ledger.
create or replace function public.protect_profile_fields()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.points_balance is distinct from old.points_balance
       or new.email is distinct from old.email
       or new.id is distinct from old.id then
      raise exception 'These profile fields cannot be edited directly.';
    end if;
    if (new.role is distinct from old.role
        or new.permissions is distinct from old.permissions
        or new.is_active is distinct from old.is_active) then
      raise exception 'Use the staff management screen to change roles and access.';
    end if;
  end if;
  return new;
end $$;

create trigger trg_profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- ---------------------------------------------------------------------------
-- Manager override PINs
-- ---------------------------------------------------------------------------
create or replace function public.set_my_pin(p_pin text)
returns void language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_uid uuid := public.assert_staff();
begin
  if p_pin !~ '^[0-9]{4,8}$' then
    raise exception 'PIN must be 4 to 8 digits.';
  end if;
  insert into public.staff_pins (profile_id, pin_hash, updated_at)
  values (v_uid, crypt(p_pin, gen_salt('bf', 8)), now())
  on conflict (profile_id) do update set pin_hash = excluded.pin_hash, updated_at = now();
  perform public.log_audit('pin.set', 'profile', v_uid::text);
end $$;

create or replace function public.has_pin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff_pins where profile_id = auth.uid())
$$;

-- Checks a supervisor PIN for the given permission. Never raises on a wrong
-- PIN so that the failed attempt is committed (used for lockout).
create or replace function public.request_override(p_permission text, p_pin text)
returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_uid uuid := public.assert_staff();
  v_fails integer;
  v_granter public.profiles;
  v_grant_id uuid;
begin
  if p_permission not in ('apply_discount', 'void_order', 'refund_order', 'admin') then
    raise exception 'Unknown permission.';
  end if;
  select count(*) into v_fails from public.override_grants
   where requested_by = v_uid and not succeeded and created_at > now() - interval '10 minutes';
  if v_fails >= 5 then
    return jsonb_build_object('ok', false, 'error', 'Too many incorrect PIN attempts. Try again in 10 minutes.');
  end if;

  select p.* into v_granter
    from public.staff_pins sp join public.profiles p on p.id = sp.profile_id
   where p.is_active
     and (p.role = 'admin' or (p_permission <> 'admin' and p.role = 'staff' and p_permission = any (p.permissions)))
     and sp.pin_hash = crypt(coalesce(p_pin, ''), sp.pin_hash)
   order by (p.role = 'admin') desc
   limit 1;

  insert into public.override_grants (permission, requested_by, granted_by, succeeded)
  values (p_permission, v_uid, v_granter.id, v_granter.id is not null)
  returning id into v_grant_id;

  if v_granter.id is null then
    perform public.log_audit('override.failed', 'override', v_grant_id::text, jsonb_build_object('permission', p_permission));
    return jsonb_build_object('ok', false, 'error', 'Incorrect PIN or not authorized.');
  end if;
  perform public.log_audit('override.granted', 'override', v_grant_id::text,
    jsonb_build_object('permission', p_permission, 'granted_by', v_granter.id, 'granted_by_name', v_granter.full_name));
  return jsonb_build_object('ok', true, 'grant_id', v_grant_id, 'granted_by_name', v_granter.full_name);
end $$;

-- Returns the profile that authorized the action. A supplied grant (manager
-- PIN approval) is used first, so an admin can lift a staff member above
-- their own limits; otherwise the caller's own permissions apply.
-- Error messages starting with AUTH_REQUIRED tell the POS to prompt for a PIN.
create or replace function public.authorize_action(p_permission text, p_grant_id uuid, p_require_admin boolean default false)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_grant public.override_grants;
begin
  if p_grant_id is not null then
    select g.* into v_grant from public.override_grants g
     where g.id = p_grant_id and g.requested_by = v_uid and g.succeeded and g.used_at is null
       and g.expires_at > now()
       and (g.permission = p_permission or g.permission = 'admin')
     for update;
    if found and (not p_require_admin or exists (
        select 1 from public.profiles where id = v_grant.granted_by and role = 'admin')) then
      update public.override_grants set used_at = now() where id = v_grant.id;
      return v_grant.granted_by;
    end if;
  end if;

  -- No (usable) grant supplied: the caller's own role/permissions
  if p_require_admin then
    if public.is_admin() then return v_uid; end if;
  elsif public.has_permission(p_permission) then
    return v_uid;
  end if;

  if p_require_admin then
    raise exception 'AUTH_REQUIRED_ADMIN: An admin PIN is required for this action.';
  end if;
  raise exception 'AUTH_REQUIRED: A manager PIN is required for this action.';
end $$;

-- ---------------------------------------------------------------------------
-- Units of measure
-- ---------------------------------------------------------------------------
create or replace function public.unit_dimension(u public.stock_unit)
returns text language sql immutable as $$
  select case u when 'kg' then 'mass' when 'g' then 'mass'
                when 'l' then 'volume' when 'ml' then 'volume'
                else u::text end
$$;

create or replace function public.unit_factor(u public.stock_unit)
returns numeric language sql immutable as $$
  select case u when 'kg' then 1000 when 'l' then 1000 else 1 end::numeric
$$;

create or replace function public.convert_qty(p_qty numeric, p_from public.stock_unit, p_to public.stock_unit)
returns numeric language plpgsql immutable as $$
begin
  if p_from = p_to then return p_qty; end if;
  if public.unit_dimension(p_from) <> public.unit_dimension(p_to) then
    raise exception 'Cannot convert % to %.', p_from, p_to;
  end if;
  return p_qty * public.unit_factor(p_from) / public.unit_factor(p_to);
end $$;

create or replace function public.validate_recipe_ingredient()
returns trigger language plpgsql as $$
declare v_item_unit public.stock_unit;
begin
  if new.inventory_item_id is not null then
    select unit into v_item_unit from public.inventory_items where id = new.inventory_item_id;
    if public.unit_dimension(v_item_unit) <> public.unit_dimension(new.unit) then
      raise exception 'Unit % does not match the stock unit (%) of this ingredient.', new.unit, v_item_unit;
    end if;
  end if;
  if new.sub_recipe_id is not null then
    new.unit := null;
    -- Reject cycles: the sub-recipe must not (transitively) include this recipe
    if exists (
      with recursive tree(rid, depth) as (
        select new.sub_recipe_id, 1
        union all
        select ri.sub_recipe_id, t.depth + 1
          from tree t join public.recipe_ingredients ri on ri.recipe_id = t.rid
         where ri.sub_recipe_id is not null and t.depth < 10
      )
      select 1 from tree where rid = new.recipe_id
    ) then
      raise exception 'A recipe cannot include itself.';
    end if;
  end if;
  return new;
end $$;

create trigger trg_recipe_ingredients_validate before insert or update on public.recipe_ingredients
  for each row execute function public.validate_recipe_ingredient();

-- Inventory stock and cost only change through stock movements.
create or replace function public.protect_inventory_stock()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.current_stock := 0;
      new.avg_cost := 0;
      new.last_purchase_cost := 0;
    elsif new.current_stock is distinct from old.current_stock
       or new.avg_cost is distinct from old.avg_cost
       or new.last_purchase_cost is distinct from old.last_purchase_cost then
      raise exception 'Stock levels and costs change only through purchases and adjustments.';
    elsif new.unit is distinct from old.unit and exists (
      select 1 from public.inventory_movements where inventory_item_id = old.id) then
      raise exception 'The unit cannot change after stock has moved. Create a new item instead.';
    end if;
  end if;
  return new;
end $$;

create trigger trg_inventory_items_protect before insert or update on public.inventory_items
  for each row execute function public.protect_inventory_stock();

-- ---------------------------------------------------------------------------
-- Recipes and costing
-- ---------------------------------------------------------------------------
-- Expands a recipe (including nested sub-recipes) into raw inventory needs,
-- in each inventory item's own stock unit, for `p_servings` servings.
create or replace function public.recipe_requirements(
  p_recipe_id uuid, p_servings numeric, p_service public.service_type
) returns table (inventory_item_id uuid, cost_type public.cost_type, quantity numeric)
language sql stable security definer set search_path = public as $$
  with recursive tree as (
    select ri.inventory_item_id, ri.sub_recipe_id, ri.unit, ri.cost_type,
           ri.quantity * (p_servings / r.yield_servings) as qty, 1 as depth
      from public.recipe_ingredients ri
      join public.recipes r on r.id = ri.recipe_id
     where ri.recipe_id = p_recipe_id
       and (ri.applies_to = 'all' or ri.applies_to::text = p_service::text)
    union all
    select c.inventory_item_id, c.sub_recipe_id, c.unit, c.cost_type,
           c.quantity * (t.qty / r.yield_servings), t.depth + 1
      from tree t
      join public.recipe_ingredients c on c.recipe_id = t.sub_recipe_id
      join public.recipes r on r.id = c.recipe_id
     where t.sub_recipe_id is not null and t.depth < 8
       and (c.applies_to = 'all' or c.applies_to::text = p_service::text)
  )
  select t.inventory_item_id, t.cost_type, sum(public.convert_qty(t.qty, t.unit, i.unit))
    from tree t join public.inventory_items i on i.id = t.inventory_item_id
   where t.inventory_item_id is not null
   group by t.inventory_item_id, t.cost_type
$$;

create or replace function public.recipe_unit_cost(p_recipe_id uuid, p_service public.service_type)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(round(sum(req.quantity * i.avg_cost), 4), 0)
    from public.recipe_requirements(p_recipe_id, 1, p_service) req
    join public.inventory_items i on i.id = req.inventory_item_id
$$;

create or replace function public.product_unit_cost(p_product_id uuid, p_service public.service_type)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((
    select public.recipe_unit_cost(r.id, p_service) from public.recipes r where r.product_id = p_product_id
  ), 0)
$$;

-- Admin view of one recipe: each raw ingredient with quantity and cost.
create or replace function public.recipe_cost_breakdown(p_recipe_id uuid, p_service public.service_type)
returns table (
  inventory_item_id uuid, item_name text, unit public.stock_unit, cost_type public.cost_type,
  quantity numeric, unit_cost numeric, cost numeric
) language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_admin();
  return query
    select i.id, i.name, i.unit, req.cost_type, round(req.quantity, 4), i.avg_cost,
           round(req.quantity * i.avg_cost, 4)
      from public.recipe_requirements(p_recipe_id, 1, p_service) req
      join public.inventory_items i on i.id = req.inventory_item_id
     order by req.cost_type, i.name;
end $$;

-- One row per product with current cost, price and margin (admin only)
create or replace function public.product_costing()
returns table (
  product_id uuid, product_name text, category_name text, price numeric, has_recipe boolean,
  dine_in_cost numeric, takeout_cost numeric, dine_in_profit numeric, dine_in_margin numeric,
  takeout_profit numeric, takeout_margin numeric, is_archived boolean
) language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_admin();
  return query
    with c as (
      select p.id, p.name, cat.name as cat_name, p.price, p.is_archived, cat.sort_order as cs, p.sort_order as ps,
             r.id is not null as has_recipe,
             coalesce(public.recipe_unit_cost(r.id, 'dine_in'), 0) as di,
             coalesce(public.recipe_unit_cost(r.id, 'takeout'), 0) as tk
        from public.products p
        join public.categories cat on cat.id = p.category_id
        left join public.recipes r on r.product_id = p.id
    )
    select c.id, c.name, c.cat_name, c.price, c.has_recipe, round(c.di, 2), round(c.tk, 2),
           round(c.price - c.di, 2),
           case when c.price > 0 then round((c.price - c.di) / c.price * 100, 1) else 0 end,
           round(c.price - c.tk, 2),
           case when c.price > 0 then round((c.price - c.tk) / c.price * 100, 1) else 0 end,
           c.is_archived
      from c order by c.cs, c.ps, c.name;
end $$;

-- Records a cost-history row for every product whose cost or price changed.
create or replace function public.snapshot_product_costs()
returns integer language plpgsql volatile security definer set search_path = public as $$
declare v_count integer;
begin
  insert into public.product_cost_history (product_id, dine_in_cost, takeout_cost, price)
  select p.id, round(public.product_unit_cost(p.id, 'dine_in'), 4),
         round(public.product_unit_cost(p.id, 'takeout'), 4), p.price
    from public.products p
    left join lateral (
      select h.dine_in_cost, h.takeout_cost, h.price from public.product_cost_history h
       where h.product_id = p.id order by h.recorded_at desc, h.id desc limit 1
    ) last on true
   where exists (select 1 from public.recipes r where r.product_id = p.id)
     and (last.price is null
          or last.price <> p.price
          or last.dine_in_cost <> round(public.product_unit_cost(p.id, 'dine_in'), 4)
          or last.takeout_cost <> round(public.product_unit_cost(p.id, 'takeout'), 4));
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Admin: replace a recipe's lines in one transaction
create or replace function public.save_recipe(
  p_recipe_id uuid, p_name text, p_product_id uuid, p_yield numeric, p_notes text, p_lines jsonb
) returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_id uuid := p_recipe_id;
  v_line jsonb;
  v_order integer := 0;
begin
  perform public.assert_admin();
  if coalesce(trim(p_name), '') = '' then raise exception 'Recipe name is required.'; end if;
  if p_yield is null or p_yield <= 0 then raise exception 'Yield must be greater than zero.'; end if;
  if jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) <> 'array' then raise exception 'Invalid recipe lines.'; end if;

  if v_id is null then
    insert into public.recipes (name, product_id, yield_servings, notes)
    values (trim(p_name), p_product_id, p_yield, coalesce(p_notes, ''))
    returning id into v_id;
  else
    update public.recipes set name = trim(p_name), product_id = p_product_id,
           yield_servings = p_yield, notes = coalesce(p_notes, '')
     where id = v_id;
    if not found then raise exception 'Recipe not found.'; end if;
    delete from public.recipe_ingredients where recipe_id = v_id;
  end if;

  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_order := v_order + 1;
    insert into public.recipe_ingredients (
      recipe_id, inventory_item_id, sub_recipe_id, quantity, unit, cost_type, applies_to, sort_order)
    values (
      v_id,
      public.try_uuid(v_line ->> 'inventory_item_id'),
      public.try_uuid(v_line ->> 'sub_recipe_id'),
      (v_line ->> 'quantity')::numeric,
      nullif(v_line ->> 'unit', '')::public.stock_unit,
      coalesce(nullif(v_line ->> 'cost_type', ''), 'ingredient')::public.cost_type,
      coalesce(nullif(v_line ->> 'applies_to', ''), 'all')::public.line_applies_to,
      v_order);
  end loop;

  perform public.snapshot_product_costs();
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Stock movements (the only way stock changes)
-- ---------------------------------------------------------------------------
create or replace function public.apply_stock_movement(
  p_item_id uuid, p_type public.movement_type, p_qty numeric, p_unit_cost numeric,
  p_order_id uuid default null, p_refund_id uuid default null, p_po_id uuid default null,
  p_notes text default ''
) returns bigint language plpgsql volatile security definer set search_path = public as $$
declare
  v_item public.inventory_items;
  v_new_stock numeric;
  v_new_avg numeric;
  v_cost numeric;
  v_id bigint;
begin
  select * into v_item from public.inventory_items where id = p_item_id for update;
  if not found then raise exception 'Inventory item not found.'; end if;
  if p_qty = 0 then return null; end if;

  v_cost := coalesce(p_unit_cost, v_item.avg_cost);
  v_new_stock := v_item.current_stock + p_qty;
  v_new_avg := v_item.avg_cost;

  -- Weighted-average cost: incoming stock with a known cost re-weights the average
  if p_qty > 0 and p_type in ('purchase', 'opening', 'sale_reversal') then
    if v_item.current_stock <= 0 or v_item.avg_cost = 0 then
      v_new_avg := v_cost;
    else
      v_new_avg := (v_item.current_stock * v_item.avg_cost + p_qty * v_cost) / v_new_stock;
    end if;
  end if;

  update public.inventory_items
     set current_stock = v_new_stock,
         avg_cost = round(v_new_avg, 6),
         last_purchase_cost = case when p_type = 'purchase' then round(v_cost, 6) else last_purchase_cost end
   where id = p_item_id;

  insert into public.inventory_movements (
    inventory_item_id, movement_type, quantity, unit_cost, balance_after, avg_cost_after,
    order_id, refund_id, purchase_order_id, notes, created_by)
  values (p_item_id, p_type, p_qty, round(v_cost, 6), v_new_stock, round(v_new_avg, 6),
          p_order_id, p_refund_id, p_po_id, coalesce(p_notes, ''), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- Admin: opening stock, manual adjustments, spoilage and physical counts
create or replace function public.record_stock_adjustment(
  p_item_id uuid, p_type public.movement_type, p_quantity numeric, p_unit_cost numeric, p_notes text
) returns bigint language plpgsql volatile security definer set search_path = public as $$
declare
  v_item public.inventory_items;
  v_delta numeric;
  v_id bigint;
begin
  perform public.assert_admin();
  if p_type not in ('opening', 'adjustment', 'spoilage', 'count') then
    raise exception 'Unsupported adjustment type.';
  end if;
  if p_quantity is null then raise exception 'Quantity is required.'; end if;
  if p_type in ('adjustment', 'spoilage', 'count') and coalesce(trim(p_notes), '') = '' then
    raise exception 'Please add a note explaining this adjustment.';
  end if;
  select * into v_item from public.inventory_items where id = p_item_id for update;
  if not found then raise exception 'Inventory item not found.'; end if;

  v_delta := case p_type
    when 'opening' then abs(p_quantity)
    when 'spoilage' then -abs(p_quantity)
    when 'count' then p_quantity - v_item.current_stock
    else p_quantity end;
  if p_type = 'count' and p_quantity < 0 then raise exception 'Counted stock cannot be negative.'; end if;
  if p_type = 'opening' and (p_unit_cost is null or p_unit_cost < 0) then
    raise exception 'Opening stock needs a unit cost.';
  end if;
  if v_delta = 0 then raise exception 'No change to record.'; end if;

  v_id := public.apply_stock_movement(p_item_id, p_type, v_delta,
            case when p_type = 'opening' then p_unit_cost else null end, null, null, null, p_notes);
  perform public.log_audit('stock.' || p_type::text, 'inventory_item', p_item_id::text,
    jsonb_build_object('item', v_item.name, 'quantity', v_delta, 'unit', v_item.unit, 'notes', p_notes));
  if p_type = 'opening' then perform public.snapshot_product_costs(); end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Purchasing
-- ---------------------------------------------------------------------------
create or replace function public.create_purchase_order(
  p_supplier_id uuid, p_order_date date, p_notes text, p_items jsonb, p_receive_now boolean
) returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_po_id uuid;
  v_line jsonb;
  v_item public.inventory_items;
begin
  perform public.assert_admin();
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one item to the purchase.';
  end if;
  insert into public.purchase_orders (po_number, supplier_id, status, order_date, notes, created_by)
  values ('PO-' || to_char(public.manila_today(), 'YYMMDD') || '-' || lpad(public.next_counter('po')::text, 3, '0'),
          p_supplier_id, 'ordered', coalesce(p_order_date, public.manila_today()), coalesce(p_notes, ''), auth.uid())
  returning id into v_po_id;

  for v_line in select * from jsonb_array_elements(p_items) loop
    select * into v_item from public.inventory_items where id = public.try_uuid(v_line ->> 'inventory_item_id');
    if not found then raise exception 'Unknown inventory item in purchase.'; end if;
    if coalesce((v_line ->> 'quantity')::numeric, 0) <= 0 then raise exception 'Quantities must be positive.'; end if;
    if coalesce((v_line ->> 'unit_cost')::numeric, -1) < 0 then raise exception 'Unit cost is required.'; end if;
    -- validates the unit is compatible
    perform public.convert_qty(1, coalesce(nullif(v_line ->> 'unit', ''), v_item.unit::text)::public.stock_unit, v_item.unit);
    insert into public.purchase_order_items (purchase_order_id, inventory_item_id, quantity, unit, unit_cost, expiration_date)
    values (v_po_id, v_item.id, (v_line ->> 'quantity')::numeric,
            coalesce(nullif(v_line ->> 'unit', ''), v_item.unit::text)::public.stock_unit,
            (v_line ->> 'unit_cost')::numeric, nullif(v_line ->> 'expiration_date', '')::date);
  end loop;

  update public.purchase_orders
     set total_cost = (select coalesce(sum(line_total), 0) from public.purchase_order_items where purchase_order_id = v_po_id)
   where id = v_po_id;
  perform public.log_audit('purchase.create', 'purchase_order', v_po_id::text, jsonb_build_object('items', p_items));
  if p_receive_now then
    perform public.receive_purchase_order(v_po_id);
  end if;
  return v_po_id;
end $$;

create or replace function public.receive_purchase_order(p_po_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_po public.purchase_orders;
  v_line record;
  v_qty numeric;
begin
  perform public.assert_admin();
  select * into v_po from public.purchase_orders where id = p_po_id for update;
  if not found then raise exception 'Purchase order not found.'; end if;
  if v_po.status = 'received' then raise exception 'This purchase was already received.'; end if;
  if v_po.status = 'cancelled' then raise exception 'This purchase was cancelled.'; end if;

  for v_line in
    select poi.*, i.unit as item_unit from public.purchase_order_items poi
      join public.inventory_items i on i.id = poi.inventory_item_id
     where poi.purchase_order_id = p_po_id
  loop
    v_qty := public.convert_qty(v_line.quantity, v_line.unit, v_line.item_unit);
    perform public.apply_stock_movement(v_line.inventory_item_id, 'purchase', v_qty,
      v_line.line_total / v_qty, null, null, p_po_id, 'Received ' || v_po.po_number);
    if v_line.expiration_date is not null then
      update public.inventory_items set expiration_date = v_line.expiration_date where id = v_line.inventory_item_id;
    end if;
  end loop;

  update public.purchase_orders set status = 'received', received_at = now(), received_by = auth.uid() where id = p_po_id;
  perform public.log_audit('purchase.receive', 'purchase_order', p_po_id::text, jsonb_build_object('po_number', v_po.po_number));
  perform public.snapshot_product_costs();
end $$;

create or replace function public.cancel_purchase_order(p_po_id uuid, p_reason text)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  perform public.assert_admin();
  update public.purchase_orders set status = 'cancelled', notes = trim(notes || E'\nCancelled: ' || coalesce(p_reason, ''))
   where id = p_po_id and status in ('draft', 'ordered');
  if not found then raise exception 'Only open purchase orders can be cancelled.'; end if;
  perform public.log_audit('purchase.cancel', 'purchase_order', p_po_id::text, jsonb_build_object('reason', p_reason));
end $$;

-- Admin: record cost history after manual price edits
create or replace function public.admin_snapshot_costs()
returns integer language plpgsql volatile security definer set search_path = public as $$
begin
  perform public.assert_admin();
  return public.snapshot_product_costs();
end $$;

-- Admin: every recipe with its current cost per serving
create or replace function public.admin_recipe_costs()
returns table (recipe_id uuid, name text, product_id uuid, yield_servings numeric, dine_in_cost numeric, takeout_cost numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_admin();
  return query
    select r.id, r.name, r.product_id, r.yield_servings,
           round(public.recipe_unit_cost(r.id, 'dine_in'), 4), round(public.recipe_unit_cost(r.id, 'takeout'), 4)
      from public.recipes r order by r.product_id nulls first, r.name;
end $$;
