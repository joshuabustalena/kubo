-- =============================================================================
-- Servings stock per menu item (e.g. "Java Toc: 40 servings today").
--
--   * Opt-in per item: products.track_stock. Untracked items are unlimited.
--   * Every order line deducts its servings the moment the order is created
--     (online or POS), under a row lock, so two customers can never buy the
--     last serving. Quotes run in a rolled-back subtransaction, so previews
--     don't consume stock.
--   * At 0 the item is sold out: the menu and POS show it and the database
--     refuses new orders for it ("Only N left" when asking for more than left).
--   * Cancelled / voided orders give their servings back; refunds marked
--     "restock" give the refunded servings back.
--   * Staff and admins set stock through set_product_stock() (audited).
-- =============================================================================

alter table public.products
  add column track_stock boolean not null default false,
  add column stock_quantity integer not null default 0 check (stock_quantity >= 0);

-- Per-order stock changes shouldn't flood the audit log (set_product_stock logs edits)
create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_changes jsonb := '{}'::jsonb;
  v_key text;
  v_ignore text[] := array['updated_at', 'current_stock', 'avg_cost', 'last_purchase_cost', 'points_balance', 'stock_quantity'];
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

-- Deduct servings as each order line is created
create or replace function public.take_product_stock()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  p public.products;
begin
  if new.product_id is null then return new; end if;
  select * into p from public.products where id = new.product_id for update;
  if not p.track_stock then return new; end if;
  if p.stock_quantity <= 0 then
    raise exception '% is sold out.', p.name;
  end if;
  if p.stock_quantity < new.quantity then
    raise exception 'Only % left of %. Please lower the quantity.', p.stock_quantity, p.name;
  end if;
  update public.products set stock_quantity = stock_quantity - new.quantity where id = p.id;
  return new;
end $$;
create trigger trg_order_items_take_stock before insert on public.order_items
  for each row execute function public.take_product_stock();

-- Give servings back when an order is cancelled (each order is cancelled once)
create or replace function public.return_order_stock()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    update public.products p
       set stock_quantity = p.stock_quantity + x.qty
      from (select product_id, sum(quantity) as qty from public.order_items
             where order_id = new.id and product_id is not null group by product_id) x
     where p.id = x.product_id and p.track_stock;
  end if;
  return new;
end $$;
create trigger trg_orders_return_stock after update of status on public.orders
  for each row execute function public.return_order_stock();

-- Refunds marked "return to stock" give the refunded servings back
create or replace function public.return_refund_stock()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_product uuid;
begin
  if not (select restocked from public.refunds where id = new.refund_id) then return new; end if;
  select product_id into v_product from public.order_items where id = new.order_item_id;
  update public.products set stock_quantity = stock_quantity + new.quantity where id = v_product and track_stock;
  return new;
end $$;
create trigger trg_refund_items_return_stock after insert on public.refund_items
  for each row execute function public.return_refund_stock();

-- Staff/admin: turn tracking on/off and set servings left (e.g. start of day)
create or replace function public.set_product_stock(p_product_id uuid, p_track boolean, p_quantity integer)
returns void language plpgsql volatile security definer set search_path = public as $$
declare p public.products;
begin
  perform public.assert_staff();
  if p_quantity is null or p_quantity < 0 or p_quantity > 100000 then
    raise exception 'Servings must be 0 or more.';
  end if;
  select * into p from public.products where id = p_product_id for update;
  if not found then raise exception 'Product not found.'; end if;
  update public.products set track_stock = p_track, stock_quantity = p_quantity where id = p_product_id;
  perform public.log_audit('stock.set', 'products', p_product_id::text, jsonb_build_object(
    'product', p.name, 'track_stock', jsonb_build_object('from', p.track_stock, 'to', p_track),
    'stock_quantity', jsonb_build_object('from', p.stock_quantity, 'to', p_quantity)));
end $$;
revoke execute on function public.set_product_stock(uuid, boolean, integer) from public, anon;
grant execute on function public.set_product_stock(uuid, boolean, integer) to authenticated;
