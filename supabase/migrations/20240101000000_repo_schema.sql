-- ===== SUPABASE_SETUP_FULL.sql =====
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

-- ===== SUPABASE_V2_UPDATE.sql =====
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

-- ===== SUPABASE_V21_UPDATE.sql =====
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

-- ===== V220_DATABASE_UPDATE.sql =====
-- RE Portal V2.2.0: action reminders, archive/restore, recurring controls
-- Safe to run once as a new query. Uses IF NOT EXISTS throughout.

alter table public.properties add column if not exists archived_at timestamptz;
alter table public.properties add column if not exists mortgage_recurring_enabled boolean not null default true;
alter table public.units add column if not exists archived_at timestamptz;
alter table public.transactions add column if not exists archived_at timestamptz;
alter table public.documents add column if not exists archived_at timestamptz;
alter table public.documents add column if not exists expires_at date;
alter table public.documents add column if not exists reminder_days integer not null default 60;
alter table public.utility_accounts add column if not exists archived_at timestamptz;

create index if not exists properties_archived_at_idx on public.properties(archived_at);
create index if not exists units_archived_at_idx on public.units(archived_at);
create index if not exists transactions_archived_at_idx on public.transactions(archived_at);
create index if not exists documents_archived_at_idx on public.documents(archived_at);
create index if not exists documents_expires_at_idx on public.documents(expires_at);
create index if not exists utility_accounts_archived_at_idx on public.utility_accounts(archived_at);

-- ===== V226_DATABASE_UPDATE.sql =====
-- RE Portal V2.2.6
-- Accountant-ready transaction metadata + receipt storage.

alter table public.transactions
  add column if not exists needs_review boolean not null default false,
  add column if not exists receipt_path text;

-- Normalize a few legacy categories into accountant-friendly names.
update public.transactions
set category = 'Mortgage Payment (Unsplit)', needs_review = true
where category = 'Mortgage';

update public.transactions
set category = 'Capital Improvements / CapEx'
where category = 'CapEx';

update public.transactions
set category = 'Legal & Professional'
where category = 'Legal';

update public.transactions
set category = 'Needs Review', needs_review = true
where category in ('Other', 'Other Expense');

insert into storage.buckets (id, name, public)
values ('transaction-receipts', 'transaction-receipts', false)
on conflict (id) do nothing;

drop policy if exists "Users can read own transaction receipts" on storage.objects;
create policy "Users can read own transaction receipts"
on storage.objects for select to authenticated
using (
  bucket_id = 'transaction-receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can upload own transaction receipts" on storage.objects;
create policy "Users can upload own transaction receipts"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'transaction-receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can update own transaction receipts" on storage.objects;
create policy "Users can update own transaction receipts"
on storage.objects for update to authenticated
using (
  bucket_id = 'transaction-receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'transaction-receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete own transaction receipts" on storage.objects;
create policy "Users can delete own transaction receipts"
on storage.objects for delete to authenticated
using (
  bucket_id = 'transaction-receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- ===== V228_DATABASE_UPDATE.sql =====
-- V2.2.8 polish + document connection
alter table public.transactions
  add column if not exists supporting_document_id uuid null references public.documents(id) on delete set null;

create index if not exists transactions_supporting_document_id_idx
  on public.transactions(supporting_document_id);

-- ===== V229_DATABASE_UPDATE.sql =====
-- V2.2.9 transaction/document linking
create table if not exists public.transaction_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(transaction_id, document_id)
);
alter table public.transaction_documents enable row level security;
drop policy if exists "Users can read own transaction document links" on public.transaction_documents;
create policy "Users can read own transaction document links" on public.transaction_documents for select to authenticated using (user_id = auth.uid());
drop policy if exists "Users can insert own transaction document links" on public.transaction_documents;
create policy "Users can insert own transaction document links" on public.transaction_documents for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "Users can update own transaction document links" on public.transaction_documents;
create policy "Users can update own transaction document links" on public.transaction_documents for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Users can delete own transaction document links" on public.transaction_documents;
create policy "Users can delete own transaction document links" on public.transaction_documents for delete to authenticated using (user_id = auth.uid());
create index if not exists transaction_documents_transaction_idx on public.transaction_documents(transaction_id);
create index if not exists transaction_documents_document_idx on public.transaction_documents(document_id);
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='transactions' and column_name='supporting_document_id') then
    execute 'insert into public.transaction_documents (user_id, transaction_id, document_id) select user_id, id, supporting_document_id from public.transactions where supporting_document_id is not null on conflict (transaction_id, document_id) do nothing';
  end if;
end $$;

-- ===== V230_DASHBOARD_VISITS.sql =====
-- v2.3 Daily Portfolio Pulse
-- Run once in the Supabase SQL Editor.

create table if not exists public.dashboard_visits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dashboard_visits enable row level security;

drop policy if exists "Users can read own dashboard visit" on public.dashboard_visits;
create policy "Users can read own dashboard visit"
on public.dashboard_visits for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can insert own dashboard visit" on public.dashboard_visits;
create policy "Users can insert own dashboard visit"
on public.dashboard_visits for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users can update own dashboard visit" on public.dashboard_visits;
create policy "Users can update own dashboard visit"
on public.dashboard_visits for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- ===== V240_DAILY_BRIEF.sql =====
-- v2.4 Daily Brief
-- Run once in the Supabase SQL Editor.

create table if not exists public.dashboard_visits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dashboard_visits
  add column if not exists dismissed_insight_ids jsonb not null default '[]'::jsonb;

alter table public.dashboard_visits
  add column if not exists dismissed_for_date date;

alter table public.dashboard_visits enable row level security;

drop policy if exists "Users can read own dashboard visit" on public.dashboard_visits;
create policy "Users can read own dashboard visit"
on public.dashboard_visits for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can insert own dashboard visit" on public.dashboard_visits;
create policy "Users can insert own dashboard visit"
on public.dashboard_visits for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users can update own dashboard visit" on public.dashboard_visits;
create policy "Users can update own dashboard visit"
on public.dashboard_visits for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- ===== V241_DAILY_BRIEF_VISITS.sql =====
-- Stable visit snapshots and deterministic change events for Daily Brief.
alter table public.dashboard_visits add column if not exists previous_visit_at timestamptz;
alter table public.dashboard_visits add column if not exists current_visit_started_at timestamptz;
alter table public.dashboard_visits add column if not exists brief_items jsonb not null default '[]'::jsonb;
alter table public.dashboard_visits add column if not exists brief_opened_ids jsonb not null default '[]'::jsonb;
alter table public.dashboard_visits add column if not exists brief_resolved_ids jsonb not null default '[]'::jsonb;

create table if not exists public.app_events (
  id bigint generated by default as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null, entity_type text not null, entity_id uuid, property_id uuid, unit_id uuid,
  occurred_at timestamptz not null default now(), metadata jsonb not null default '{}'::jsonb
);
alter table public.app_events enable row level security;
drop policy if exists "Users can read own app events" on public.app_events;
create policy "Users can read own app events" on public.app_events for select to authenticated using (user_id=auth.uid());

create or replace function public.capture_portfolio_event() returns trigger language plpgsql security definer set search_path=public as $$
declare r jsonb:=to_jsonb(new); o jsonb:=case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end; kind text:=lower(tg_table_name); event_name text;
begin
  event_name:=case when tg_op='INSERT' then trim(trailing 's' from kind)||'_added'
    when kind='transactions' and r->>'status'='posted' and o->>'status'='pending' and r->>'category'='Rent' then 'rent_confirmed'
    when kind='transactions' and r->>'status'='declined' and o->>'status'='pending' and r->>'category'='Rent' then 'rent_declined'
    when kind='transactions' and r->>'category' is distinct from o->>'category' then 'transaction_categorized'
    when kind='units' and r->>'occupied' is distinct from o->>'occupied' then 'occupancy_changed'
    when kind='units' and r->>'lease_end_date' is distinct from o->>'lease_end_date' then 'lease_updated'
    when kind='properties' and (r->>'mortgage_balance' is distinct from o->>'mortgage_balance' or r->>'monthly_mortgage_payment' is distinct from o->>'monthly_mortgage_payment') then 'mortgage_updated'
    else trim(trailing 's' from kind)||'_updated' end;
  insert into public.app_events(user_id,event_type,entity_type,entity_id,property_id,unit_id,metadata)
  values ((r->>'user_id')::uuid,event_name,trim(trailing 's' from kind),(r->>'id')::uuid,case when kind='properties' then (r->>'id')::uuid else nullif(r->>'property_id','')::uuid end,case when kind='units' then (r->>'id')::uuid when kind='transactions' then nullif(r->>'unit_id','')::uuid else null end,jsonb_build_object('operation',tg_op));
  return new;
end $$;
do $$ declare t text; begin foreach t in array array['properties','units','transactions','documents'] loop execute format('drop trigger if exists portfolio_event_%I on public.%I',t,t);execute format('create trigger portfolio_event_%I after insert or update on public.%I for each row execute function public.capture_portfolio_event()',t,t);end loop;end $$;

-- ===== V242_MORTGAGE_DETAILS.sql =====
alter table public.properties
  add column if not exists mortgage_interest_rate numeric(6,3),
  add column if not exists mortgage_term_years integer,
  add column if not exists mortgage_principal_interest_payment numeric(12,2),
  add column if not exists mortgage_escrow_amount numeric(12,2);

