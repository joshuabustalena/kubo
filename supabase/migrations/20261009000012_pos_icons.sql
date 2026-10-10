-- POS icon per menu item: a small cut-out picture shown on the POS register tiles.
-- Separate from image_url (the customer-menu photo). Empty = the POS shows
-- an emoji.
alter table public.products add column if not exists pos_icon_url text;

-- Icons made from public/POS (uploaded to the menu-images bucket under pos-icons/)
update public.products p
   set pos_icon_url = v.url
  from (values
  ('java-chicken-fillet', 'https://jielkozjyvbvorypbrhp.supabase.co/storage/v1/object/public/menu-images/pos-icons/java-chicken-fillet-1791653872452.webp'),
  ('java-chick', 'https://jielkozjyvbvorypbrhp.supabase.co/storage/v1/object/public/menu-images/pos-icons/java-chick-1791653872452.webp'),
  ('java-liempo', 'https://jielkozjyvbvorypbrhp.supabase.co/storage/v1/object/public/menu-images/pos-icons/java-liempo-1791653872452.webp'),
  ('java-siomai', 'https://jielkozjyvbvorypbrhp.supabase.co/storage/v1/object/public/menu-images/pos-icons/java-siomai-1791653872452.webp'),
  ('black-gulaman', 'https://jielkozjyvbvorypbrhp.supabase.co/storage/v1/object/public/menu-images/pos-icons/black-gulaman-1791653872452.webp'),
  ('extra-gravy', 'https://jielkozjyvbvorypbrhp.supabase.co/storage/v1/object/public/menu-images/pos-icons/extra-gravy-1791653872452.webp'),
  ('java-dawg', 'https://jielkozjyvbvorypbrhp.supabase.co/storage/v1/object/public/menu-images/pos-icons/java-dawg-1791653872452.webp'),
  ('java-toc', 'https://jielkozjyvbvorypbrhp.supabase.co/storage/v1/object/public/menu-images/pos-icons/java-toc-1791653872452.webp'),
  ('fries', 'https://jielkozjyvbvorypbrhp.supabase.co/storage/v1/object/public/menu-images/pos-icons/fries-1791653872452.webp'),
  ('extra-java-rice', 'https://jielkozjyvbvorypbrhp.supabase.co/storage/v1/object/public/menu-images/pos-icons/extra-java-rice-1791653872452.webp'),
  ('cheesy-java-dawg', 'https://jielkozjyvbvorypbrhp.supabase.co/storage/v1/object/public/menu-images/pos-icons/cheesy-java-dawg-1791653872452.webp'),
  ('java-long', 'https://jielkozjyvbvorypbrhp.supabase.co/storage/v1/object/public/menu-images/pos-icons/java-long-1791653872452.webp'),
  ('java-porkchop', 'https://jielkozjyvbvorypbrhp.supabase.co/storage/v1/object/public/menu-images/pos-icons/java-porkchop-1791653872452.webp'),
  ('java-sisig', 'https://jielkozjyvbvorypbrhp.supabase.co/storage/v1/object/public/menu-images/pos-icons/java-sisig-1791653872452.webp')
  ) v(slug, url)
 where p.slug = v.slug;
