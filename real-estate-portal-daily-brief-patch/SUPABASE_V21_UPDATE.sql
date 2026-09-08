-- RE Portal V2.1 update
-- Run once in Supabase SQL Editor before deploying V2.1.

alter table public.properties add column if not exists image_path text;

alter table public.transactions drop constraint if exists transactions_status_check;
alter table public.transactions add constraint transactions_status_check check (status in ('pending','posted','declined'));

insert into storage.buckets (id, name, public, file_size_limit)
values ('property-images', 'property-images', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;

drop policy if exists "reportal_property_images_select" on storage.objects;
drop policy if exists "reportal_property_images_insert" on storage.objects;
drop policy if exists "reportal_property_images_update" on storage.objects;
drop policy if exists "reportal_property_images_delete" on storage.objects;

create policy "reportal_property_images_select" on storage.objects for select to authenticated
using (bucket_id = 'property-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "reportal_property_images_insert" on storage.objects for insert to authenticated
with check (bucket_id = 'property-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "reportal_property_images_update" on storage.objects for update to authenticated
using (bucket_id = 'property-images' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'property-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "reportal_property_images_delete" on storage.objects for delete to authenticated
using (bucket_id = 'property-images' and (storage.foldername(name))[1] = auth.uid()::text);
