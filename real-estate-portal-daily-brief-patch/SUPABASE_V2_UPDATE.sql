-- RE Portal V2 update
-- Run this once in Supabase SQL Editor before deploying V2.

-- 1) Doorvest CSV import metadata + duplicate protection
alter table public.transactions add column if not exists source text;
alter table public.transactions add column if not exists import_key text;
create unique index if not exists transactions_user_import_key_unique
  on public.transactions(user_id, import_key);

-- 2) Documents metadata
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  property_id uuid not null references public.properties(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  category text not null,
  title text not null,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  file_size bigint,
  document_date date,
  notes text,
  created_at timestamptz default now()
);

alter table public.documents enable row level security;
drop policy if exists "reportal_documents_own" on public.documents;
create policy "reportal_documents_own" on public.documents
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create index if not exists documents_user_id_idx on public.documents(user_id);
create index if not exists documents_property_id_idx on public.documents(property_id);
create index if not exists documents_category_idx on public.documents(category);

-- 3) Private Supabase Storage bucket for property files
insert into storage.buckets (id, name, public, file_size_limit)
values ('property-documents', 'property-documents', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = 26214400;

drop policy if exists "reportal_docs_storage_select" on storage.objects;
drop policy if exists "reportal_docs_storage_insert" on storage.objects;
drop policy if exists "reportal_docs_storage_update" on storage.objects;
drop policy if exists "reportal_docs_storage_delete" on storage.objects;

create policy "reportal_docs_storage_select" on storage.objects
for select to authenticated
using (
  bucket_id = 'property-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "reportal_docs_storage_insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'property-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "reportal_docs_storage_update" on storage.objects
for update to authenticated
using (
  bucket_id = 'property-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'property-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "reportal_docs_storage_delete" on storage.objects
for delete to authenticated
using (
  bucket_id = 'property-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- 4) Utility account directory (no passwords stored)
create table if not exists public.utility_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  property_id uuid not null references public.properties(id) on delete cascade,
  utility_type text not null,
  provider text not null,
  account_number text,
  username_email text,
  login_url text,
  autopay boolean default false,
  responsibility text not null default 'Owner' check (responsibility in ('Owner','Tenant','Shared')),
  billing_cycle text,
  password_reference text,
  notes text,
  created_at timestamptz default now()
);
alter table public.utility_accounts enable row level security;
drop policy if exists "reportal_utilities_own" on public.utility_accounts;
create policy "reportal_utilities_own" on public.utility_accounts
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
create index if not exists utility_accounts_user_id_idx on public.utility_accounts(user_id);
create index if not exists utility_accounts_property_id_idx on public.utility_accounts(property_id);

-- 5) Recurring property financials + pending rent workflow
alter table public.properties add column if not exists monthly_mortgage_payment numeric(12,2) default 0;
alter table public.properties add column if not exists management_fee_percent numeric(6,3) default 0;
alter table public.units add column if not exists recurring_rent_enabled boolean default true;
alter table public.transactions add column if not exists status text not null default 'posted' check (status in ('pending','posted'));
alter table public.transactions add column if not exists confirmed_at timestamptz;

-- Existing transactions are real ledger activity.
update public.transactions set status = 'posted' where status is null;


-- 6) V2.1 property images + persistent declined rent state
alter table public.properties add column if not exists image_path text;

-- Expand transaction status so a monthly rent suggestion can be explicitly declined
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
