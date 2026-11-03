-- =============================================================================
-- Every menu item can be redeemed for free with points.
-- One "Free <item>" reward per menu item, points = price ÷ 5 rounded up
-- (₱60 → 12 pts, ₱70 → 14 pts, ₱95 → 19 pts). Kept in step with the menu:
--   new item → reward created · price/name change → reward follows ·
--   item archived → reward hidden (and back when the item returns).
-- A reward with follows_menu_price = false keeps whatever points the admin set.
-- =============================================================================
alter table public.rewards add column if not exists follows_menu_price boolean not null default false;

create or replace function public.menu_reward_points(p_price numeric)
returns integer language sql immutable as $$
  select greatest(1, ceil(coalesce(p_price, 0) / 5))::integer
$$;

-- Rewards that follow the menu always carry the current points for their item
create or replace function public.set_menu_reward_points()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_price numeric;
begin
  if new.follows_menu_price and new.reward_type = 'free_product' and new.product_id is not null then
    select price into v_price from public.products where id = new.product_id;
    if found then new.points_cost := public.menu_reward_points(v_price); end if;
  end if;
  return new;
end $$;
create trigger trg_rewards_menu_points before insert or update on public.rewards
  for each row execute function public.set_menu_reward_points();

-- Menu changes flow into the rewards catalogue
create or replace function public.sync_menu_reward()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.rewards where product_id = new.id and follows_menu_price) then
    update public.rewards
       set name = 'Free ' || new.name,
           points_cost = public.menu_reward_points(new.price),
           is_active = not new.is_archived
     where product_id = new.id and follows_menu_price;
  elsif not new.is_archived
        and not exists (select 1 from public.rewards where product_id = new.id and reward_type = 'free_product') then
    insert into public.rewards (name, description, reward_type, product_id, points_cost, is_redeemable, valid_days, follows_menu_price)
    values ('Free ' || new.name,
            'One ' || new.name || ' on us. Show your code at the counter or use it at checkout.',
            'free_product', new.id, public.menu_reward_points(new.price), true, 30, true);
  end if;
  return new;
end $$;
create trigger trg_products_menu_reward after insert or update of name, price, is_archived on public.products
  for each row execute function public.sync_menu_reward();

revoke execute on function public.sync_menu_reward() from public, anon, authenticated;
revoke execute on function public.set_menu_reward_points() from public, anon, authenticated;

-- Fill the catalogue for today's menu
insert into public.rewards (name, description, reward_type, product_id, points_cost, is_redeemable, valid_days, follows_menu_price)
select 'Free ' || p.name,
       'One ' || p.name || ' on us. Show your code at the counter or use it at checkout.',
       'free_product', p.id, public.menu_reward_points(p.price), true, 30, true
  from public.products p
 where not p.is_archived
   and not exists (select 1 from public.rewards r where r.product_id = p.id and r.reward_type = 'free_product');
