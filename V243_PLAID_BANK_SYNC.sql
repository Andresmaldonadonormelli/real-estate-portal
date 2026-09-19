-- RE Portal V2.4.3: Plaid bank sync tables + unseen-import columns
-- Safe to run once in the Supabase SQL Editor. Uses IF NOT EXISTS throughout.

-- 1) Ledger columns used by bank imports and nav badges
alter table public.transactions
  add column if not exists source_institution text,
  add column if not exists source_account_mask text,
  add column if not exists source_connection_status text,
  add column if not exists is_new_import boolean not null default false,
  add column if not exists import_acknowledged_at timestamptz;

create index if not exists transactions_new_import_idx
  on public.transactions(user_id)
  where is_new_import = true and status = 'posted' and archived_at is null;

create index if not exists transactions_source_plaid_idx
  on public.transactions(user_id, source)
  where source = 'plaid' and archived_at is null;

-- 2) Linked bank Items (one Plaid connection / institution login)
create table if not exists public.plaid_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plaid_item_id text not null,
  access_token_encrypted text not null,
  institution_id text,
  institution_name text not null default 'Linked bank',
  status text not null default 'connected',
  cursor text,
  last_synced_at timestamptz,
  error_code text,
  error_message text,
  disconnected_at timestamptz,
  created_at timestamptz not null default now(),
  unique (plaid_item_id)
);

create index if not exists plaid_items_user_id_idx on public.plaid_items(user_id);
create index if not exists plaid_items_active_idx on public.plaid_items(user_id) where disconnected_at is null;

alter table public.plaid_items enable row level security;
drop policy if exists "Users can read own plaid items" on public.plaid_items;
create policy "Users can read own plaid items"
  on public.plaid_items for select to authenticated
  using (user_id = auth.uid());

-- Writes go through the server with the service role key (Link, sync, webhook).

-- 3) Bank accounts under an Item, each optionally mapped to a property
create table if not exists public.plaid_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null references public.plaid_items(id) on delete cascade,
  plaid_account_id text not null,
  name text not null,
  official_name text,
  mask text,
  type text not null,
  subtype text,
  current_balance numeric(14,2),
  available_balance numeric(14,2),
  iso_currency_code text default 'USD',
  property_id uuid references public.properties(id) on delete set null,
  import_enabled boolean not null default false,
  stopped_at timestamptz,
  archived_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  unique (plaid_account_id)
);

create index if not exists plaid_accounts_user_id_idx on public.plaid_accounts(user_id);
create index if not exists plaid_accounts_item_id_idx on public.plaid_accounts(item_id);
create index if not exists plaid_accounts_property_id_idx on public.plaid_accounts(property_id);
create index if not exists plaid_accounts_active_idx on public.plaid_accounts(user_id) where archived_at is null;

alter table public.plaid_accounts enable row level security;
drop policy if exists "Users can read own plaid accounts" on public.plaid_accounts;
create policy "Users can read own plaid accounts"
  on public.plaid_accounts for select to authenticated
  using (user_id = auth.uid());

-- 4) Raw Plaid transactions + link to ledger rows
create table if not exists public.plaid_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null references public.plaid_items(id) on delete cascade,
  account_id uuid references public.plaid_accounts(id) on delete set null,
  plaid_transaction_id text not null,
  transaction_date date,
  authorized_date date,
  name text,
  merchant_name text,
  amount numeric(14,2),
  pending boolean not null default false,
  pending_transaction_id text,
  category_primary text,
  category_detailed text,
  removed boolean not null default false,
  raw_data jsonb,
  ledger_transaction_id uuid references public.transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (plaid_transaction_id)
);

create index if not exists plaid_transactions_user_id_idx on public.plaid_transactions(user_id);
create index if not exists plaid_transactions_account_id_idx on public.plaid_transactions(account_id);
create index if not exists plaid_transactions_item_id_idx on public.plaid_transactions(item_id);
create index if not exists plaid_transactions_ledger_idx on public.plaid_transactions(ledger_transaction_id);

alter table public.plaid_transactions enable row level security;
drop policy if exists "Users can read own plaid transactions" on public.plaid_transactions;
create policy "Users can read own plaid transactions"
  on public.plaid_transactions for select to authenticated
  using (user_id = auth.uid());
