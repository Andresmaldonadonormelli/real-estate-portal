-- RE Portal V2.4.7: Ledger transaction rules for recurring categorization.
-- Safe to run once in the Supabase SQL Editor. Uses IF NOT EXISTS throughout.

create table if not exists public.transaction_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  match_text text not null,
  match_direction text not null check (match_direction in ('incoming', 'outgoing')),
  match_account_mask text,
  match_property_id uuid references public.properties(id) on delete set null,
  assign_category text not null,
  assign_property_id uuid references public.properties(id) on delete set null,
  created_from_transaction_id uuid references public.transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists transaction_rules_user_id_idx
  on public.transaction_rules(user_id)
  where archived_at is null;

create index if not exists transaction_rules_user_enabled_idx
  on public.transaction_rules(user_id, enabled)
  where archived_at is null and enabled = true;

alter table public.transaction_rules enable row level security;

drop policy if exists "reportal_transaction_rules_own" on public.transaction_rules;
create policy "reportal_transaction_rules_own" on public.transaction_rules
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
