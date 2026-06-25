insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'restaurant-assets',
  'restaurant-assets',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public reads restaurant assets" on storage.objects;
create policy "public reads restaurant assets"
on storage.objects for select
using (bucket_id = 'restaurant-assets');

drop policy if exists "authenticated uploads restaurant assets" on storage.objects;
create policy "authenticated uploads restaurant assets"
on storage.objects for insert
to authenticated
with check (bucket_id = 'restaurant-assets');

drop policy if exists "authenticated updates restaurant assets" on storage.objects;
create policy "authenticated updates restaurant assets"
on storage.objects for update
to authenticated
using (bucket_id = 'restaurant-assets')
with check (bucket_id = 'restaurant-assets');

drop policy if exists "authenticated deletes restaurant assets" on storage.objects;
create policy "authenticated deletes restaurant assets"
on storage.objects for delete
to authenticated
using (bucket_id = 'restaurant-assets');
