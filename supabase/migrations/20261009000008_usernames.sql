-- =============================================================================
-- Username + mobile number accounts (no email needed, no verification).
--
-- Supabase Auth still needs an email internally, so the app creates each
-- account with a hidden address (<username>@kainansakubo.app) through the
-- Auth admin API with the email pre-confirmed — nothing is ever sent to it.
-- Customers sign in with their username or mobile number + password.
-- Older email-based accounts (e.g. the first admin) keep working.
-- =============================================================================

alter table public.profiles
  add column username text check (username is null or username ~ '^[a-z0-9_.]{3,20}$');

create unique index profiles_username_key on public.profiles (username) where username is not null;
-- One account per mobile number
create unique index profiles_phone_key on public.profiles (phone) where phone <> '';

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_username text := nullif(lower(new.raw_user_meta_data ->> 'username'), '');
begin
  insert into public.profiles (id, email, full_name, username, phone)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), v_username, split_part(coalesce(new.email, ''), '@', 1)), 120),
    v_username,
    left(coalesce(new.raw_user_meta_data ->> 'phone', ''), 30)
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- Usernames are the login name: users cannot change their own
create or replace function public.protect_profile_fields()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.points_balance is distinct from old.points_balance
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

-- Audit entry when an admin sets a temporary password (the reset itself is done
-- through the Auth admin API on the server)
create or replace function public.admin_log_password_reset(p_user_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  perform public.assert_admin();
  perform public.log_audit('user.password_reset', 'profile', p_user_id::text,
    jsonb_build_object('username', (select username from public.profiles where id = p_user_id)));
end $$;
revoke execute on function public.admin_log_password_reset(uuid) from public, anon;
grant execute on function public.admin_log_password_reset(uuid) to authenticated;
