-- Local dev schema alignment.
-- The repository's shipped SQL files are a partial history; the application code
-- selects and writes several columns and Plaid tables that never made it into a
-- committed migration. This file adds exactly those objects so a fresh local
-- Supabase database matches what the app expects. Everything is idempotent.

-- Properties: extra mortgage detail columns referenced by lib/supabaseData.ts and app/page.tsx
alter table public.properties add column if not exists mortgage_pmi_amount numeric(12,2);
alter table public.properties add column if not exists mortgage_start_date date;
alter table public.properties add column if not exists mortgage_due_day integer;
alter table public.properties add column if not exists mortgage_principal_amount numeric(12,2);
alter table public.properties add column if not exists mortgage_interest_amount numeric(12,2);

-- Units: lease + vacancy columns referenced by UNIT_DETAIL_FIELDS and the daily brief
alter table public.units add column if not exists lease_start_date date;
alter table public.units add column if not exists lease_end_date date;
alter table public.units add column if not exists lease_document_path text;
alter table public.units add column if not exists vacancy_started_at date;

-- Transactions: bank-import + mortgage-split columns referenced by TRANSACTION_FIELDS and inserts
alter table public.transactions add column if not exists source_institution text;
alter table public.transactions add column if not exists source_account_mask text;
alter table public.transactions add column if not exists source_connection_status text;
alter table public.transactions add column if not exists is_new_import boolean not null default false;
alter table public.transactions add column if not exists import_acknowledged_at timestamptz;
alter table public.transactions add column if not exists mortgage_principal_amount numeric(12,2);
alter table public.transactions add column if not exists mortgage_interest_amount numeric(12,2);
alter table public.transactions add column if not exists mortgage_escrow_amount numeric(12,2);

-- Plaid linkage tables used by the /account page and /api/plaid/* routes.
-- These are accessed with the service-role key, but RLS + owner policies are added
-- so the schema is safe if ever queried with the anon key.
create table if not exists public.plaid_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plaid_item_id text unique,
  institution_id text,
  institution_name text,
  access_token_encrypted text not null,
  cursor text,
  status text default 'connected',
  error_code text,
  error_message text,
  last_synced_at timestamptz,
  disconnected_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.plaid_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null references public.plaid_items(id) on delete cascade,
  plaid_account_id text not null,
  name text,
  official_name text,
  mask text,
  type text,
  subtype text,
  current_balance numeric(14,2),
  available_balance numeric(14,2),
  iso_currency_code text default 'USD',
  property_id uuid references public.properties(id) on delete set null,
  import_enabled boolean not null default true,
  last_synced_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.plaid_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null references public.plaid_items(id) on delete cascade,
  account_id uuid references public.plaid_accounts(id) on delete set null,
  plaid_transaction_id text unique not null,
  transaction_date date,
  authorized_date date,
  name text,
  merchant_name text,
  amount numeric(14,2),
  pending boolean default false,
  pending_transaction_id text,
  category_primary text,
  category_detailed text,
  removed boolean not null default false,
  raw_data jsonb,
  ledger_transaction_id uuid references public.transactions(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.plaid_items enable row level security;
alter table public.plaid_accounts enable row level security;
alter table public.plaid_transactions enable row level security;

drop policy if exists "reportal_plaid_items_own" on public.plaid_items;
create policy "reportal_plaid_items_own" on public.plaid_items for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "reportal_plaid_accounts_own" on public.plaid_accounts;
create policy "reportal_plaid_accounts_own" on public.plaid_accounts for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "reportal_plaid_transactions_own" on public.plaid_transactions;
create policy "reportal_plaid_transactions_own" on public.plaid_transactions for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

create index if not exists plaid_items_user_id_idx on public.plaid_items(user_id);
create index if not exists plaid_accounts_item_id_idx on public.plaid_accounts(item_id);
create index if not exists plaid_transactions_item_id_idx on public.plaid_transactions(item_id);
create index if not exists plaid_transactions_account_id_idx on public.plaid_transactions(account_id);
