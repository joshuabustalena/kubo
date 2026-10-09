-- =============================================================================
-- Java Kubo — Supabase Storage bucket for menu and reward images
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu-images', 'menu-images', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "menu images are public"
  on storage.objects for select
  using (bucket_id = 'menu-images');

create policy "admins upload menu images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'menu-images' and public.is_admin());

create policy "admins update menu images"
  on storage.objects for update to authenticated
  using (bucket_id = 'menu-images' and public.is_admin());

create policy "admins delete menu images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'menu-images' and public.is_admin());
