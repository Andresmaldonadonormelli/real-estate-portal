-- RE Portal V1 database setup
-- Safe to run on a new project. It also adds missing V1 columns to tables that already exist.

create extension if not exists pgcrypto;

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  address text not null,
  city text not null,
  state text not null,
  zip text not null,
  property_type text,
  estimated_value numeric(12,2) default 0,
  mortgage_balance numeric(12,2) default 0,
  purchase_price numeric(12,2),
  purchase_date date,
  created_at timestamptz default now()
);

alter table public.properties add column if not exists user_id uuid;
alter table public.properties add column if not exists mortgage_balance numeric(12,2) default 0;
alter table public.properties add column if not exists purchase_price numeric(12,2);
alter table public.properties add column if not exists purchase_date date;
alter table public.properties add column if not exists created_at timestamptz default now();

create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  property_id uuid not null references public.properties(id) on delete cascade,
  unit_number text not null,
  bedroom_count numeric(5,1) default 0,
  bathroom_count numeric(5,1) default 0,
  sqft integer default 0,
  current_rent numeric(12,2) default 0,
  tenant_name text default '',
  occupied boolean default false,
  created_at timestamptz default now()
);

alter table public.units add column if not exists user_id uuid;
alter table public.units add column if not exists created_at timestamptz default now();

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  property_id uuid not null references public.properties(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  transaction_date date not null,
  type text not null check (type in ('income','expense','transfer')),
  category text not null,
  description text not null,
  payee_source text,
  amount numeric(12,2) not null,
  notes text,
  created_at timestamptz default now()
);

alter table public.transactions add column if not exists user_id uuid;
alter table public.transactions add column if not exists unit_id uuid references public.units(id) on delete set null;
alter table public.transactions add column if not exists created_at timestamptz default now();

alter table public.properties enable row level security;
alter table public.units enable row level security;
alter table public.transactions enable row level security;

-- Remove only policies created by this setup so the script can be re-run.
drop policy if exists "reportal_properties_own" on public.properties;
drop policy if exists "reportal_units_own" on public.units;
drop policy if exists "reportal_transactions_own" on public.transactions;

create policy "reportal_properties_own" on public.properties
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "reportal_units_own" on public.units
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "reportal_transactions_own" on public.transactions
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create index if not exists properties_user_id_idx on public.properties(user_id);
create index if not exists units_user_id_idx on public.units(user_id);
create index if not exists units_property_id_idx on public.units(property_id);
create index if not exists transactions_user_id_idx on public.transactions(user_id);
create index if not exists transactions_property_id_idx on public.transactions(property_id);
create index if not exists transactions_date_idx on public.transactions(transaction_date desc);
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
