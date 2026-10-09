-- =============================================================================
-- Java Kubo — core schema
-- Tables, enums, constraints and indexes. Business logic lives in
-- 20261009000002_functions.sql and access rules in 20261009000003_rls.sql.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'staff', 'customer');
create type public.order_status as enum ('pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled');
create type public.order_channel as enum ('online', 'pos');
create type public.service_type as enum ('dine_in', 'takeout');
create type public.payment_status as enum ('unpaid', 'pending_verification', 'paid', 'partially_refunded', 'refunded');
create type public.stock_unit as enum ('kg', 'g', 'l', 'ml', 'pc', 'pack', 'bottle');
create type public.movement_type as enum (
  'opening', 'purchase', 'sale', 'sale_reversal', 'adjustment', 'spoilage', 'count'
);
create type public.cost_type as enum (
  'ingredient', 'oil_seasoning', 'gravy', 'drink', 'packaging', 'consumable'
);
create type public.line_applies_to as enum ('all', 'dine_in', 'takeout');
create type public.reward_type as enum ('free_product', 'fixed_discount', 'percent_discount');
create type public.redemption_status as enum ('issued', 'used', 'expired', 'cancelled');
create type public.ledger_entry_type as enum (
  'earn', 'earn_reversal', 'redeem', 'redeem_reversal', 'game_reward', 'admin_adjustment'
);
create type public.game_session_status as enum ('started', 'completed', 'expired');
create type public.prize_type as enum ('none', 'points', 'reward');
create type public.po_status as enum ('draft', 'ordered', 'received', 'cancelled');
create type public.expense_category as enum (
  'labor', 'rent', 'utilities', 'supplies', 'maintenance', 'marketing', 'transport', 'other'
);

-- ---------------------------------------------------------------------------
-- Shared trigger: updated_at
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Store settings (singleton row)
-- ---------------------------------------------------------------------------
create table public.store_settings (
  id boolean primary key default true check (id),
  store_name text not null default 'Java Kubo',
  tagline text not null default 'Sulit Java Rice meals, kubo style.',
  about text not null default '',
  address text not null default '',
  phone text not null default '',
  email text not null default '',
  facebook_url text not null default '',
  map_url text not null default '',
  opening_hours jsonb not null default '[]'::jsonb,
  online_ordering_enabled boolean not null default true,
  takeout_packaging_fee numeric(10,2) not null default 0 check (takeout_packaging_fee >= 0),
  -- Loyalty rules (editable from the admin panel)
  points_enabled boolean not null default true,
  points_price_threshold numeric(10,2) not null default 65 check (points_price_threshold >= 0),
  points_at_or_below integer not null default 1 check (points_at_or_below >= 0),
  points_above integer not null default 2 check (points_above >= 0),
  points_on_addons boolean not null default false,
  -- Inventory rules
  inventory_deduct_stage public.order_status not null default 'completed'
    check (inventory_deduct_stage in ('preparing', 'completed')),
  restock_on_cancel boolean not null default true,
  block_orders_on_low_stock boolean not null default false,
  -- POS rules
  max_staff_discount_percent numeric(5,2) not null default 20 check (max_staff_discount_percent between 0 and 100),
  updated_at timestamptz not null default now()
);
create trigger trg_store_settings_touch before update on public.store_settings
  for each row execute function public.touch_updated_at();
insert into public.store_settings (id) values (true);

-- ---------------------------------------------------------------------------
-- Profiles and roles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  full_name text not null default '' check (char_length(full_name) <= 120),
  phone text not null default '' check (char_length(phone) <= 30),
  student_school text not null default '' check (char_length(student_school) <= 120),
  role public.app_role not null default 'customer',
  -- Extra staff capabilities: 'apply_discount', 'void_order', 'refund_order', 'view_sales'
  permissions text[] not null default '{}',
  is_active boolean not null default true,
  points_balance integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_role_idx on public.profiles (role);
create index profiles_email_idx on public.profiles (lower(email));
create trigger trg_profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Manager / staff override PINs. Never readable by clients (no RLS policy).
create table public.staff_pins (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  pin_hash text not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Menu
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  description text not null default '',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  is_addon_category boolean not null default false,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_categories_touch before update on public.categories
  for each row execute function public.touch_updated_at();

create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  description text not null default '',
  price numeric(10,2) not null check (price >= 0),
  image_url text,
  is_available boolean not null default true,
  is_archived boolean not null default false,
  is_addon boolean not null default false,
  points_eligible boolean not null default true,
  is_featured boolean not null default false,
  sort_order integer not null default 0,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_category_idx on public.products (category_id);
create trigger trg_products_touch before update on public.products
  for each row execute function public.touch_updated_at();

-- Which add-ons may be attached to which meals
create table public.product_addons (
  product_id uuid not null references public.products (id) on delete cascade,
  addon_product_id uuid not null references public.products (id) on delete cascade,
  primary key (product_id, addon_product_id),
  check (product_id <> addon_product_id)
);

-- ---------------------------------------------------------------------------
-- Suppliers and inventory
-- ---------------------------------------------------------------------------
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  contact_person text not null default '',
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  notes text not null default '',
  is_active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_suppliers_touch before update on public.suppliers
  for each row execute function public.touch_updated_at();

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique check (char_length(sku) between 1 and 40),
  name text not null check (char_length(name) between 1 and 120),
  category text not null default 'ingredient',
  unit public.stock_unit not null,
  current_stock numeric(14,4) not null default 0,
  min_stock numeric(14,4) not null default 0 check (min_stock >= 0),
  -- Weighted-average purchase cost per one `unit`
  avg_cost numeric(14,6) not null default 0 check (avg_cost >= 0),
  last_purchase_cost numeric(14,6) not null default 0 check (last_purchase_cost >= 0),
  supplier_id uuid references public.suppliers (id) on delete set null,
  expiration_date date,
  is_archived boolean not null default false,
  notes text not null default '',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index inventory_items_supplier_idx on public.inventory_items (supplier_id);
create trigger trg_inventory_items_touch before update on public.inventory_items
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Recipes (a recipe either belongs to a product or is a reusable sub-recipe,
-- e.g. "Java Rice (1 serving)")
-- ---------------------------------------------------------------------------
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  product_id uuid unique references public.products (id) on delete cascade,
  yield_servings numeric(10,3) not null default 1 check (yield_servings > 0),
  notes text not null default '',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_recipes_touch before update on public.recipes
  for each row execute function public.touch_updated_at();

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  inventory_item_id uuid references public.inventory_items (id) on delete restrict,
  sub_recipe_id uuid references public.recipes (id) on delete restrict,
  -- For inventory items: amount in `unit`. For sub-recipes: servings of the sub-recipe.
  quantity numeric(14,4) not null check (quantity > 0),
  unit public.stock_unit,
  cost_type public.cost_type not null default 'ingredient',
  applies_to public.line_applies_to not null default 'all',
  sort_order integer not null default 0,
  check ((inventory_item_id is not null)::int + (sub_recipe_id is not null)::int = 1),
  check (inventory_item_id is null or unit is not null),
  check (sub_recipe_id is null or sub_recipe_id <> recipe_id)
);
create index recipe_ingredients_recipe_idx on public.recipe_ingredients (recipe_id);
create index recipe_ingredients_item_idx on public.recipe_ingredients (inventory_item_id);

-- Cost-per-serving history, written whenever costs or recipes change
create table public.product_cost_history (
  id bigserial primary key,
  product_id uuid not null references public.products (id) on delete cascade,
  dine_in_cost numeric(12,4) not null,
  takeout_cost numeric(12,4) not null,
  price numeric(10,2) not null,
  recorded_at timestamptz not null default now()
);
create index product_cost_history_idx on public.product_cost_history (product_id, recorded_at desc);

-- ---------------------------------------------------------------------------
-- Purchasing
-- ---------------------------------------------------------------------------
create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_number text not null unique,
  supplier_id uuid references public.suppliers (id) on delete set null,
  status public.po_status not null default 'draft',
  order_date date not null default (now() at time zone 'Asia/Manila')::date,
  received_at timestamptz,
  total_cost numeric(12,2) not null default 0,
  notes text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  received_by uuid references public.profiles (id) on delete set null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_purchase_orders_touch before update on public.purchase_orders
  for each row execute function public.touch_updated_at();

create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders (id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items (id) on delete restrict,
  quantity numeric(14,4) not null check (quantity > 0),
  unit public.stock_unit not null,
  unit_cost numeric(14,6) not null check (unit_cost >= 0),
  line_total numeric(12,2) generated always as (round(quantity * unit_cost, 2)) stored,
  expiration_date date
);
create index purchase_order_items_po_idx on public.purchase_order_items (purchase_order_id);

-- ---------------------------------------------------------------------------
-- Payment methods, promotions
-- ---------------------------------------------------------------------------
create table public.payment_methods (
  code text primary key check (code ~ '^[a-z0-9_]+$'),
  name text not null,
  instructions text not null default '',
  is_active boolean not null default true,
  allow_online boolean not null default true,
  allow_pos boolean not null default true,
  is_cash boolean not null default false,
  requires_reference boolean not null default false,
  sort_order integer not null default 0
);

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  code text unique check (code is null or code ~ '^[A-Z0-9-]{3,20}$'),
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  value numeric(10,2) not null check (value > 0),
  min_subtotal numeric(10,2) not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  applies_online boolean not null default true,
  applies_pos boolean not null default true,
  is_active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  check (discount_type <> 'percent' or value <= 100)
);

-- ---------------------------------------------------------------------------
-- Rewards
-- ---------------------------------------------------------------------------
create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  reward_type public.reward_type not null,
  value numeric(10,2) not null default 0 check (value >= 0),
  product_id uuid references public.products (id) on delete set null,
  points_cost integer not null default 0 check (points_cost >= 0),
  is_redeemable boolean not null default true, -- false = only obtainable from games
  per_customer_limit integer check (per_customer_limit is null or per_customer_limit > 0),
  total_limit integer check (total_limit is null or total_limit > 0),
  valid_days integer not null default 30 check (valid_days > 0), -- code lifetime after issue
  expires_at timestamptz, -- catalog end date
  is_active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (reward_type <> 'free_product' or product_id is not null),
  check (reward_type <> 'percent_discount' or value <= 100)
);
create trigger trg_rewards_touch before update on public.rewards
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
create table public.daily_counters (
  counter text not null,
  day date not null,
  last_value integer not null default 0,
  primary key (counter, day)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  channel public.order_channel not null,
  customer_id uuid references public.profiles (id) on delete set null,
  customer_name text not null default '',
  service_type public.service_type not null,
  status public.order_status not null default 'pending',
  payment_status public.payment_status not null default 'unpaid',
  payment_method_code text references public.payment_methods (code),
  subtotal numeric(12,2) not null check (subtotal >= 0),
  packaging_fee numeric(12,2) not null default 0 check (packaging_fee >= 0),
  discount_total numeric(12,2) not null default 0 check (discount_total >= 0),
  total numeric(12,2) not null check (total >= 0),
  refunded_total numeric(12,2) not null default 0 check (refunded_total >= 0),
  discount_reason text not null default '',
  discount_authorized_by uuid references public.profiles (id) on delete set null,
  promotion_id uuid references public.promotions (id) on delete set null,
  notes text not null default '' check (char_length(notes) <= 500),
  staff_id uuid references public.profiles (id) on delete set null,
  idempotency_key text not null unique,
  points_awarded_at timestamptz,
  inventory_deducted_at timestamptz,
  inventory_reversed_at timestamptz,
  confirmed_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text not null default '',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (total = subtotal + packaging_fee - discount_total),
  check (refunded_total <= total)
);
create index orders_customer_idx on public.orders (customer_id, created_at desc);
create index orders_status_idx on public.orders (status, created_at desc);
create index orders_created_idx on public.orders (created_at desc);
create trigger trg_orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  parent_item_id uuid references public.order_items (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  -- Snapshots so historical reports never change
  product_name text not null,
  category_name text not null default '',
  unit_price numeric(10,2) not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0 and quantity <= 99),
  line_total numeric(12,2) not null,
  unit_cost numeric(12,4) not null default 0,
  points_eligible boolean not null default false,
  points_per_unit integer not null default 0,
  refunded_quantity integer not null default 0 check (refunded_quantity >= 0),
  notes text not null default '',
  created_at timestamptz not null default now(),
  check (refunded_quantity <= quantity),
  check (line_total = unit_price * quantity)
);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_product_idx on public.order_items (product_id);

create table public.order_status_history (
  id bigserial primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  from_status public.order_status,
  to_status public.order_status not null,
  note text not null default '',
  changed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index order_status_history_idx on public.order_status_history (order_id, created_at);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  method_code text not null references public.payment_methods (code),
  amount numeric(12,2) not null check (amount >= 0),
  amount_tendered numeric(12,2),
  change_given numeric(12,2) not null default 0,
  reference_no text not null default '',
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  received_by uuid references public.profiles (id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create index payments_order_idx on public.payments (order_id);
-- At most one verified payment per order
create unique index payments_one_verified on public.payments (order_id) where status = 'verified';

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  kind text not null check (kind in ('refund', 'void')),
  amount numeric(12,2) not null check (amount >= 0),
  reason text not null check (char_length(reason) between 3 and 300),
  restocked boolean not null default false,
  points_reversed integer not null default 0,
  processed_by uuid references public.profiles (id) on delete set null,
  authorized_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index refunds_order_idx on public.refunds (order_id);

create table public.refund_items (
  refund_id uuid not null references public.refunds (id) on delete cascade,
  order_item_id uuid not null references public.order_items (id) on delete cascade,
  quantity integer not null check (quantity > 0),
  amount numeric(12,2) not null,
  primary key (refund_id, order_item_id)
);

-- ---------------------------------------------------------------------------
-- Inventory movements (append-only stock ledger)
-- ---------------------------------------------------------------------------
create table public.inventory_movements (
  id bigserial primary key,
  inventory_item_id uuid not null references public.inventory_items (id) on delete restrict,
  movement_type public.movement_type not null,
  quantity numeric(14,4) not null, -- signed, in the item's unit
  unit_cost numeric(14,6) not null default 0,
  total_cost numeric(14,4) generated always as (round(abs(quantity) * unit_cost, 4)) stored,
  balance_after numeric(14,4) not null,
  avg_cost_after numeric(14,6) not null,
  order_id uuid references public.orders (id) on delete set null,
  refund_id uuid references public.refunds (id) on delete set null,
  purchase_order_id uuid references public.purchase_orders (id) on delete set null,
  notes text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index inventory_movements_item_idx on public.inventory_movements (inventory_item_id, created_at desc);
create index inventory_movements_created_idx on public.inventory_movements (created_at desc);
-- An order can only deduct (and reverse) each ingredient once
create unique index inventory_movements_once_per_order
  on public.inventory_movements (order_id, inventory_item_id, movement_type)
  where order_id is not null and refund_id is null and movement_type in ('sale', 'sale_reversal');

-- ---------------------------------------------------------------------------
-- Loyalty
-- ---------------------------------------------------------------------------
create table public.reward_redemptions (
  id uuid primary key default gen_random_uuid(),
  reward_id uuid not null references public.rewards (id) on delete restrict,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  code text not null unique,
  source text not null default 'points' check (source in ('points', 'game', 'admin')),
  points_spent integer not null default 0 check (points_spent >= 0),
  status public.redemption_status not null default 'issued',
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references public.profiles (id) on delete set null,
  order_id uuid references public.orders (id) on delete set null,
  discount_applied numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);
create index reward_redemptions_customer_idx on public.reward_redemptions (customer_id, created_at desc);
create index reward_redemptions_reward_idx on public.reward_redemptions (reward_id);

alter table public.orders
  add column reward_redemption_id uuid references public.reward_redemptions (id) on delete set null;

create table public.loyalty_ledger (
  id bigserial primary key,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  points integer not null check (points <> 0),
  entry_type public.ledger_entry_type not null,
  description text not null default '',
  -- Unique key that makes every award/reversal idempotent, e.g. 'order:<uuid>:earn'
  idempotency_key text not null unique,
  order_id uuid references public.orders (id) on delete set null,
  refund_id uuid references public.refunds (id) on delete set null,
  redemption_id uuid references public.reward_redemptions (id) on delete set null,
  game_session_id uuid,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index loyalty_ledger_customer_idx on public.loyalty_ledger (customer_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Games
-- ---------------------------------------------------------------------------
create table public.games (
  code text primary key check (code in ('catch', 'memory', 'wheel', 'quiz')),
  name text not null,
  tagline text not null default '',
  rules text not null default '',
  is_enabled boolean not null default true,
  daily_play_limit integer not null default 3 check (daily_play_limit between 1 and 50),
  cooldown_seconds integer not null default 60 check (cooldown_seconds >= 0),
  daily_points_cap integer not null default 10 check (daily_points_cap >= 0),
  config jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);
create trigger trg_games_touch before update on public.games
  for each row execute function public.touch_updated_at();

create table public.game_prizes (
  id uuid primary key default gen_random_uuid(),
  game_code text not null references public.games (code) on delete cascade,
  label text not null,
  prize_type public.prize_type not null,
  points integer not null default 0 check (points >= 0),
  reward_id uuid references public.rewards (id) on delete set null,
  weight integer not null default 1 check (weight >= 0), -- wheel odds
  min_score integer not null default 0, -- score-based games: highest tier reached wins
  is_active boolean not null default true,
  sort_order integer not null default 0,
  check (prize_type <> 'points' or points > 0),
  check (prize_type <> 'reward' or reward_id is not null)
);
create index game_prizes_game_idx on public.game_prizes (game_code);

create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  choices jsonb not null check (jsonb_typeof(choices) = 'array' and jsonb_array_length(choices) between 2 and 6),
  correct_index integer not null check (correct_index >= 0),
  explanation text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (correct_index < jsonb_array_length(choices))
);

create table public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  game_code text not null references public.games (code) on delete cascade,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  status public.game_session_status not null default 'started',
  public_state jsonb not null default '{}'::jsonb, -- safe to show the player
  score integer,
  prize_label text,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_at timestamptz
);
create index game_sessions_customer_idx on public.game_sessions (customer_id, game_code, started_at desc);
-- One live session per customer per game
create unique index game_sessions_one_active on public.game_sessions (customer_id, game_code) where status = 'started';

-- Hidden server state (decks, answers, spawn tables). No client policies at all.
create table public.game_session_secrets (
  session_id uuid primary key references public.game_sessions (id) on delete cascade,
  secret jsonb not null
);

create table public.game_rewards (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.game_sessions (id) on delete cascade,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  prize_id uuid references public.game_prizes (id) on delete set null,
  prize_type public.prize_type not null,
  points integer not null default 0,
  redemption_id uuid references public.reward_redemptions (id) on delete set null,
  label text not null,
  created_at timestamptz not null default now()
);
create index game_rewards_customer_idx on public.game_rewards (customer_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Expenses and audit log
-- ---------------------------------------------------------------------------
create table public.operating_expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null,
  category public.expense_category not null,
  description text not null check (char_length(description) between 1 and 200),
  amount numeric(12,2) not null check (amount > 0),
  created_by uuid references public.profiles (id) on delete set null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index operating_expenses_date_idx on public.operating_expenses (expense_date);

create table public.audit_logs (
  id bigserial primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);

-- Single-use manager authorizations for sensitive POS actions (voids, refunds,
-- discounts). Created by request_override() after a PIN check; consumed by the
-- action that needed it. No client policies.
create table public.override_grants (
  id uuid primary key default gen_random_uuid(),
  permission text not null,
  requested_by uuid not null references public.profiles (id) on delete cascade,
  granted_by uuid references public.profiles (id) on delete cascade,
  succeeded boolean not null,
  expires_at timestamptz not null default now() + interval '3 minutes',
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index override_grants_requester_idx on public.override_grants (requested_by, created_at desc);
