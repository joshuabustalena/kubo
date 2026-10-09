# Kainan sa Kubo — Online Ordering, POS, Inventory & Play Zone

A full-stack web app for **Kainan sa Kubo**, a student-friendly Filipino Java Rice eatery: customer website and online ordering, loyalty points and rewards, mini-games, a staff POS, ingredient-level inventory, recipe costing and an admin dashboard.

- **Frontend / server:** Next.js 16 (App Router, Server Actions, TypeScript), Tailwind CSS 4, shadcn-style UI primitives in `src/components/ui`, Recharts
- **Backend:** Supabase — Postgres, Auth, Storage, row-level security
- **Hosting:** Vercel

---

## 1. What's inside

| Area | Highlights |
| --- | --- |
| **Customer site** (`/`, `/menu`, `/cart`, `/checkout`, `/orders/[id]`, `/account/*`, `/play`, `/about`, `/contact`) | Mobile-first menu with search and categories, add-ons and notes, dine-in/takeout, server-priced checkout, GCash reference or cash on pickup, live order tracking, profile, order history, points ledger, rewards catalogue and codes, game history |
| **Play Zone** (`/play`) | Java Catch, Kubo Memory Match, Lucky Kubo Wheel, Food Quiz — server-side scoring, daily limits, cooldowns, daily points caps, one prize per round |
| **Staff POS** (`/pos`) | Fast product grid, sold-out toggles, add-ons, customer linking, promo and reward codes, discounts, cash change, GCash reference, confirm-before-charge, idempotent submit, receipts, order queue, payment verification, voids and refunds with manager PIN approval |
| **Admin** (`/admin`) | Dashboard, orders and refunds, reports with CSV export, menu and categories with photo upload, recipe builder and food costing, inventory and stock movements, purchases and suppliers, expenses, customers and points, rewards and loyalty rules, promotions, Play Zone settings and quiz questions, staff and permissions, audit log, store settings and payment methods |

## 2. How it is built

```
Browser ──► Next.js (Vercel)
             │  proxy.ts           refreshes the Supabase session cookie; sends signed-out users to /login
             │  layouts            role gate (customer / staff / admin) for each area
             │  server actions     validate input (zod), call Supabase as the signed-in user
             ▼
          Supabase Postgres
             RLS on every table    customers see only their own rows; staff see operations; admin sees all
             SECURITY DEFINER RPCs every money / stock / points change happens here, in one transaction,
                                   re-checking the caller's role and re-reading prices from the database
```

**Nothing the browser sends is trusted** beyond product ids, quantities and codes. Prices, discounts, packaging fees, points, stock, game scores and prizes are all computed in Postgres.

Key database functions (`supabase/migrations`):

| Function | Purpose |
| --- | --- |
| `place_online_order`, `pos_create_order` | Create an order from ids + quantities; price from DB; validate add-ons, promos, reward codes, discounts; idempotency key |
| `quote_order` | Runs the real order logic in a rolled-back subtransaction so checkout and POS totals always match the charge |
| `update_order_status` / `transition_order` | Allowed status transitions; ingredient deduction; points award; void + restock on cancel |
| `record_order_payment`, `verify_payment` | Cash/GCash at the counter; staff verification of online GCash references |
| `refund_order` | Full or partial refunds, proportional discount, points reversal, optional restock |
| `request_override` / `authorize_action` | Manager/admin PIN → single-use, logged approval for discounts, voids and refunds |
| `redeem_reward`, `lookup_redemption`, `use_redemption_at_counter`, `cancel_redemption` | Rewards and one-time codes |
| `game_start`, `game_memory_flip`, `game_finish`, `game_spin_wheel` | Server-authoritative games |
| `save_recipe`, `recipe_requirements`, `product_costing`, `snapshot_product_costs` | Recipes with nested sub-recipes, unit conversion, cost per serving, cost history |
| `create_purchase_order`, `receive_purchase_order`, `record_stock_adjustment` | Purchases (weighted-average costing), spoilage, counts, corrections |
| `report_*`, `inventory_overview` | Sales, profit, product, ingredient, staff and loyalty reports |

## 3. Business rules implemented

**Money & time.** Pesos are formatted `₱1,234.00`. Every report day is an Asia/Manila calendar day. Sales are dated by completion time.

**Loyalty points** (editable in *Admin → Loyalty & rewards*):
- A points-eligible menu item priced **₱65 or below earns 1 point**, **above ₱65 earns 2 points**, per unit (three ₱70 meals = 6 points).
- Drinks and add-ons don't earn unless you tick “Earns loyalty points” on the item / “Add-ons earn points”.
- Points are snapshotted on each order line when the order is placed, and awarded **once** when the order is **completed and paid** (`orders.points_awarded_at` + a unique ledger key `order:<id>:earn`). Retries, repeated status updates and stray calls cannot award twice.
- Refunds reverse the points on refunded meals (`refund:<id>` ledger key). Cancelled orders never earn.
- `loyalty_ledger` is append-only (a trigger blocks updates and deletes); `profiles.points_balance` is maintained from it.

**Orders.** Statuses: Pending → Confirmed → Preparing → Ready for Pickup → Completed, or Cancelled. Online cash orders are paid at pickup; online GCash orders stay *“Verifying payment”* until staff confirm the reference — the app never marks a digital payment paid by itself. An order cannot be completed until it is paid. Customers can cancel only their own unpaid, still-pending orders.

**POS security.** Confirmation step before charging; idempotency key per sale (double taps and retries return the same order); discounts need the *Apply discounts* permission or a manager PIN, and anything over the staff limit (Settings) needs an admin PIN; voiding a paid order needs *Void* permission or a PIN; refunds need *Refund* permission or a PIN. Completed sales cannot be deleted — only refunded, with an audit trail.

**Inventory.** Ingredient-level items with units (kg, g, L, ml, pc, pack, bottle) and automatic conversion between compatible units. Stock only changes through `inventory_movements` (opening, purchase, sale, sale reversal, adjustment, spoilage, count) — a trigger blocks direct edits of stock or cost. Ingredients are deducted when an order is **completed** (or when **preparing** starts — configurable). Deduction is guarded by `orders.inventory_deducted_at` plus a unique index, so retries never deduct twice. Cancelling an order that already deducted either restocks or leaves it as waste (configurable).

**Food costing.**
- *Cost per serving* = Σ (ingredient quantity, converted to the stock unit) × that ingredient's **weighted-average purchase cost**, divided by the recipe's batch yield. Sub-recipes (Java Rice, free iced tea, gravy, tray liner, takeout kit) are expanded recursively.
- Every recipe line has a cost type (ingredient, oil & seasoning, gravy, free drink, packaging, other consumable) and applies to *all*, *dine-in only* or *takeout only* orders, so the free drink, greaseproof paper and takeout container/utensils/bag are all costed.
- *Weighted average*: on each purchase, `new avg = (stock × avg + qty × unit cost) ÷ (stock + qty)` (or the purchase cost when stock was empty).
- *Gross profit per serving* = selling price − estimated direct cost per serving. *Gross margin %* = gross profit ÷ selling price × 100.
- Each order line stores its **price and cost snapshot**, so editing prices or recipes never changes past reports. `product_cost_history` records cost changes over time.
- *Estimated gross profit* (food level) is reported separately from *estimated net operating profit*, which also subtracts operating expenses you record (labor, rent, utilities, …). Neither is a tax/accounting figure.

**Mini-games.** Login required; per-game enable switch, daily play limit, cooldown and daily points cap; one live round per game (starting again resumes it); one prize per round (unique index); prizes are bonus points, a coupon from the rewards catalogue, or nothing.
- *Quiz:* questions are sent without answers; answers are graded in Postgres.
- *Memory Match:* the deck never leaves the server; each flip is revealed by an RPC (with a minimum interval between flips).
- *Wheel:* the server picks the slice before the animation starts.
- *Java Catch:* the drop table is generated by the server and the round must last its full duration; the server only counts rice items that exist and had already dropped. Because it is a real-time action game, *which* items were caught is reported by the browser — a determined cheater could claim every rice item, which is why its prizes are small and capped daily.

## 4. Set up

### Prerequisites
- Node.js 20.12+ (developed on Node 24)
- A Supabase project (free tier works) — <https://supabase.com/dashboard>
- The Supabase CLI via `npx supabase` (Docker is only needed for a fully local Supabase)

### 4.1 Database

```bash
npm install
npx supabase login
npx supabase link --project-ref YOUR-PROJECT-REF
npx supabase db push --include-seed     # applies supabase/migrations/* then supabase/seed.sql
```

`seed.sql` loads the **sample catalogue** (menu, categories, ingredients with opening stock, recipes, suppliers, rewards, promotions, games, quiz). Every sample row is flagged `is_demo = true`. It creates no orders or points. Edit or archive these from the admin screens, or skip `--include-seed` and enter your own.

Fully local alternative (needs Docker): `npx supabase start` then `npx supabase db reset`.

### 4.2 Auth settings (Supabase dashboard → Authentication)
- **URL Configuration:** Site URL = your site (e.g. `https://javakubo.vercel.app`); add `https://YOUR-SITE/auth/confirm` and `http://localhost:3000/auth/confirm` to Redirect URLs.
- **Email:** keep “Confirm email” on. For real customers configure custom SMTP (Supabase's default sender is rate-limited).
- Password minimum length 8 (matches the app).

### 4.3 Environment

```bash
cp .env.example .env.local   # then fill in the values
```

| Variable | Where | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser + server | Publishable key (or legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`) |
| `SUPABASE_SECRET_KEY` | **server only** | Secret / service-role key. Used only to create staff logins and by the scripts. Never prefix with `NEXT_PUBLIC_`. |
| `NEXT_PUBLIC_SITE_URL` | server | Used in confirmation and password-reset links |

### 4.4 First admin

```bash
npm run create-admin -- owner@example.com "a-strong-password" "Owner Name"
npm run dev    # http://localhost:3000
```

Then log in, open **POS → PIN** and set your approval PIN (used to approve cashiers' discounts, voids and refunds). Add cashiers in **Admin → Staff & access**.

### 4.5 Optional demo transactions (development projects only)

```bash
npm run seed:demo -- --yes --days 14
```

Creates demo accounts (`cashier@demo.javakubo.test`, `bea@demo.javakubo.test`, … password printed at the end) and rings up real orders through the same database functions the app uses, then back-dates them and flags them `is_demo`. The admin dashboard shows a banner while demo orders exist. **Use a separate Supabase project for development**; don't run this against the shop's live database.

## 5. Deploy to Vercel

1. Push the repo to GitHub and import it in Vercel (framework: Next.js; defaults are fine).
2. Add the four environment variables from §4.3 for *Production* (and *Preview* if you use it). Set `NEXT_PUBLIC_SITE_URL` to the production URL.
3. Deploy, then add `https://YOUR-DOMAIN/auth/confirm` to Supabase Redirect URLs and set the Site URL.
4. New migrations: `npx supabase db push` (never edit an applied migration — add a new file).

**Going-live checklist:** replace sample prices, photos, recipes and ingredient costs with real ones (record real opening stock via *Inventory → Record a stock change → Opening stock*); set the GCash number in *Settings → Payment methods*; set store address/hours; create staff logins and PINs; configure custom SMTP; turn off sample promotions you don't want.

## 6. Tests

```bash
npm test          # unit tests + database scenario tests
npm run typecheck
npm run lint
```

The database tests (`tests/db`) run the **real migrations and seed** inside an in-process Postgres (PGlite) with small stand-ins for Supabase's `auth` and `storage` schemas, then exercise the RPCs as different users with RLS on. They cover checkout pricing, add-on validation, idempotent orders, GCash verification, points-awarded-once, stock-deducted-once, partial refunds with points reversal, voids with restock, PIN approvals and limits, RLS isolation between customers, hidden costs and game secrets, reward redemption and reuse, weighted-average purchasing, spoilage/counts, recipe cycle protection, reports, and all four games (limits, cooldowns, caps, replay protection, score validation).

## 7. Project structure

```
supabase/
  migrations/          schema, core functions, orders & loyalty, games, reports, RLS, storage
  seed.sql             sample catalogue (is_demo = true)
  config.toml          local Supabase config
src/
  proxy.ts             session refresh + sign-in redirect
  app/(site)/          customer website, account, checkout, tracking, Play Zone
  app/(auth)/          login, sign-up, password reset
  app/auth/            email link handler, sign-out
  app/pos/             staff POS
  app/admin/           admin dashboard and management
  app/api/export/      CSV exports (admin only)
  components/          ui primitives, brand (logo, meal illustrations), orders, admin, pos
  lib/                 supabase clients, auth guards, formatting, cart store, data loaders
scripts/               create-admin, seed-demo
tests/                 unit + database scenario tests
```

## 8. Known limitations

- **GCash** is verified manually by staff against the reference number; there is no payment-gateway integration (PayMongo/Xendit could be added as a webhook that calls `verify_payment`).
- **Order updates** use 10–15 second polling rather than websockets.
- **Receipts** are order slips, not BIR official receipts.
- **Menu photos:** until you upload real photos (Admin → Menu item → Upload photo), items show an illustrated black-tray-and-greaseproof-paper placeholder.
- **Java Catch** scoring relies on the browser to report which items were caught (see §3); its rewards are deliberately small and capped.
- Out-of-stock blocking is optional (*Settings → Refuse orders when ingredients are not enough*); by default stock may go negative so service is never blocked by a data-entry gap, and low-stock alerts flag it.
