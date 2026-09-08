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
