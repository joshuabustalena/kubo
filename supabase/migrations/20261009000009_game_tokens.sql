-- =============================================================================
-- Game tokens: customers earn tokens by buying meals and spend one per round.
--
--   * Earned on completed + paid orders, per meal unit, with the same price
--     rule as points: price ≤ threshold (₱65) → 1 token, above → 2 tokens.
--     Snapshotted on each order line (order_items.tokens_per_unit).
--   * Each game round (start of a new round / each wheel spin) costs
--     store_settings.game_token_cost tokens (default 1). Resuming a live round
--     is free.
--   * Refunded meals take their tokens back.
--   * Append-only ledger; profiles.game_tokens is maintained from it.
-- =============================================================================

alter table public.store_settings
  add column game_tokens_enabled boolean not null default true,
  add column game_token_cost integer not null default 1 check (game_token_cost between 0 and 10);

alter table public.profiles add column game_tokens integer not null default 0;

alter table public.order_items add column tokens_per_unit integer not null default 0;
grant select (tokens_per_unit) on public.order_items to anon, authenticated;

create table public.game_token_ledger (
  id bigserial primary key,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  tokens integer not null check (tokens <> 0),
  reason text not null check (reason in ('order', 'refund', 'play', 'admin')),
  description text not null default '',
  idempotency_key text not null unique,
  order_id uuid references public.orders (id) on delete set null,
  game_session_id uuid references public.game_sessions (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index game_token_ledger_customer_idx on public.game_token_ledger (customer_id, created_at desc);
alter table public.game_token_ledger enable row level security;
create policy "own tokens or admin" on public.game_token_ledger for select
  using (customer_id = auth.uid() or public.is_admin());

create or replace function public.apply_token_entry()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set game_tokens = game_tokens + new.tokens where id = new.customer_id;
  return new;
end $$;
create trigger trg_game_token_ledger_apply after insert on public.game_token_ledger
  for each row execute function public.apply_token_entry();
create trigger trg_game_token_ledger_append_only before update or delete on public.game_token_ledger
  for each row execute function public.block_ledger_changes();

create or replace function public.add_token_entry(
  p_customer_id uuid, p_tokens integer, p_reason text, p_description text, p_key text,
  p_order_id uuid default null, p_session_id uuid default null
) returns boolean language plpgsql volatile security definer set search_path = public as $$
declare v_count integer;
begin
  if p_tokens = 0 or p_customer_id is null then return false; end if;
  insert into public.game_token_ledger (customer_id, tokens, reason, description, idempotency_key, order_id, game_session_id, created_by)
  values (p_customer_id, p_tokens, p_reason, p_description, p_key, p_order_id, p_session_id, auth.uid())
  on conflict (idempotency_key) do nothing;
  get diagnostics v_count = row_count;
  return v_count = 1;
end $$;

-- Tokens a single unit of an order line earns (same price rule as points)
create or replace function public.tokens_for_price(p_price numeric)
returns integer language sql stable security definer set search_path = public as $$
  select case when not s.game_tokens_enabled then 0
              when p_price <= s.points_price_threshold then s.points_at_or_below
              else s.points_above end
    from public.store_settings s where s.id
$$;

-- Snapshot tokens on every new order line (meals only, like points)
create or replace function public.set_order_item_tokens()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.tokens_per_unit := case when new.points_eligible then public.tokens_for_price(new.unit_price) else 0 end;
  return new;
end $$;
create trigger trg_order_items_tokens before insert on public.order_items
  for each row execute function public.set_order_item_tokens();

-- Points AND tokens are awarded once, when an order is completed and paid
create or replace function public.award_order_points(p_order_id uuid)
returns integer language plpgsql volatile security definer set search_path = public as $$
declare
  o public.orders;
  v_points integer;
  v_tokens integer;
begin
  select * into o from public.orders where id = p_order_id for update;
  if o.customer_id is null or o.points_awarded_at is not null
     or o.status <> 'completed' or o.payment_status not in ('paid', 'partially_refunded') then
    return 0;
  end if;
  select coalesce(sum(points_per_unit * (quantity - refunded_quantity)) filter (where points_eligible), 0)::integer,
         coalesce(sum(tokens_per_unit * (quantity - refunded_quantity)), 0)::integer
    into v_points, v_tokens
    from public.order_items where order_id = p_order_id;
  update public.orders set points_awarded_at = now() where id = p_order_id;
  if v_points > 0 then
    perform public.add_ledger_entry(o.customer_id, v_points, 'earn', 'Order ' || o.order_number,
      'order:' || p_order_id || ':earn', p_order_id);
  end if;
  if v_tokens > 0 then
    perform public.add_token_entry(o.customer_id, v_tokens, 'order', 'Order ' || o.order_number,
      'order:' || p_order_id || ':tokens', p_order_id);
  end if;
  return v_points;
end $$;

-- Refunded meals take their tokens back (only if tokens were awarded)
create or replace function public.reverse_refund_tokens()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  oi public.order_items;
  o public.orders;
begin
  select * into oi from public.order_items where id = new.order_item_id;
  select * into o from public.orders where id = oi.order_id;
  if o.customer_id is not null and o.points_awarded_at is not null and oi.tokens_per_unit > 0 then
    perform public.add_token_entry(o.customer_id, -(oi.tokens_per_unit * new.quantity), 'refund',
      'Refund on order ' || o.order_number, 'refund:' || new.refund_id || ':' || new.order_item_id || ':tokens', o.id);
  end if;
  return new;
end $$;
create trigger trg_refund_items_tokens after insert on public.refund_items
  for each row execute function public.reverse_refund_tokens();

-- Every new game round costs tokens (resuming a live round inserts nothing)
create or replace function public.charge_game_token()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  s public.store_settings;
  v_balance integer;
  v_name text;
begin
  select * into s from public.store_settings where id;
  if not s.game_tokens_enabled or s.game_token_cost = 0 then return new; end if;
  select game_tokens into v_balance from public.profiles where id = new.customer_id for update;
  if coalesce(v_balance, 0) < s.game_token_cost then
    raise exception 'NO_TOKENS: You need % game token% to play. Earn tokens when you buy meals: ₱% and below = % token, above = % tokens per meal.',
      s.game_token_cost, case when s.game_token_cost = 1 then '' else 's' end,
      to_char(s.points_price_threshold, 'FM999,990'), s.points_at_or_below, s.points_above;
  end if;
  select name into v_name from public.games where code = new.game_code;
  perform public.add_token_entry(new.customer_id, -s.game_token_cost, 'play', coalesce(v_name, new.game_code),
    'play:' || new.id, null, new.id);
  return new;
end $$;
create trigger trg_game_sessions_charge after insert on public.game_sessions
  for each row execute function public.charge_game_token();

-- Admin: give or take tokens (goodwill, corrections, promos)
create or replace function public.admin_adjust_tokens(p_customer_id uuid, p_tokens integer, p_reason text)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  perform public.assert_admin();
  if coalesce(p_tokens, 0) = 0 then raise exception 'Enter a non-zero amount.'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required.'; end if;
  if not exists (select 1 from public.profiles where id = p_customer_id) then raise exception 'Customer not found.'; end if;
  perform public.add_token_entry(p_customer_id, p_tokens, 'admin', trim(p_reason), 'adjust:' || gen_random_uuid());
  perform public.log_audit('tokens.adjust', 'profile', p_customer_id::text, jsonb_build_object('tokens', p_tokens, 'reason', p_reason));
end $$;

-- Users cannot edit their own token balance
create or replace function public.protect_profile_fields()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.points_balance is distinct from old.points_balance
       or new.game_tokens is distinct from old.game_tokens
       or new.email is distinct from old.email
       or new.username is distinct from old.username
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

-- Checkout / POS preview now also reports the tokens an order will earn
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
      'tokens', (select coalesce(sum(tokens_per_unit * quantity), 0) from public.order_items where order_id = o.id),
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

revoke execute on function public.add_token_entry(uuid, integer, text, text, text, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.tokens_for_price(numeric) from public, anon, authenticated;
revoke execute on function public.admin_adjust_tokens(uuid, integer, text) from public, anon;
grant execute on function public.admin_adjust_tokens(uuid, integer, text) to authenticated;
