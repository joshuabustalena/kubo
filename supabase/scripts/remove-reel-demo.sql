-- =============================================================================
-- One-off cleanup after recording the promo reel: removes the demo customer
-- "kubodemo" and everything it created (2 Java Catch rounds, its game tokens,
-- the +6 points it won, and the audit entries for the demo tokens).
-- Run once in Supabase → SQL Editor. One transaction: all or nothing.
-- =============================================================================
begin;

-- The points/token ledgers are append-only; lift that guard just for this cleanup.
alter table public.loyalty_ledger disable trigger trg_loyalty_ledger_append_only;
alter table public.game_token_ledger disable trigger trg_game_token_ledger_append_only;

with demo as (select id from public.profiles where username = 'kubodemo')
delete from public.loyalty_ledger where customer_id in (select id from demo);
with demo as (select id from public.profiles where username = 'kubodemo')
delete from public.game_token_ledger where customer_id in (select id from demo);
with demo as (select id from public.profiles where username = 'kubodemo')
delete from public.game_rewards where customer_id in (select id from demo);
with demo as (select id from public.profiles where username = 'kubodemo')
delete from public.game_sessions where customer_id in (select id from demo);

alter table public.loyalty_ledger enable trigger trg_loyalty_ledger_append_only;
alter table public.game_token_ledger enable trigger trg_game_token_ledger_append_only;

-- Audit entries about the demo account (token grants, its own actions)
with demo as (select id from public.profiles where username = 'kubodemo')
delete from public.audit_logs
 where actor_id in (select id from demo)
    or entity_id in (select id::text from demo)
    or details ->> 'customer_id' in (select id::text from demo);

-- The login itself (its profile is removed with it)
delete from auth.users where email = 'kubodemo@kainansakubo.app';

commit;

-- Check: should return 0
select count(*) as demo_left from public.profiles where username = 'kubodemo';
