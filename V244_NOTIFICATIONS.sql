-- RE Portal V2.4.4: in-app notifications
-- Safe to run once in the Supabase SQL Editor. Uses IF NOT EXISTS throughout.
-- This script creates the table only. The signed-in app writes seed and portfolio rows.
-- Phase 2 Plaid sync can insert the same rows with origin = 'plaid' using the service role.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  type text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  title text not null,
  body text not null default '',
  amount numeric(14,2),
  property_id uuid references public.properties(id) on delete set null,
  unit_id uuid references public.units(id) on delete set null,
  transaction_id uuid references public.transactions(id) on delete set null,
  dedupe_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  origin text not null default 'app',
  archived_at timestamptz,
  constraint notifications_type_check check (
    type in (
      'bank_transfer_received',
      'transaction_needs_category',
      'large_expense_posted',
      'lease_ending_soon',
      'unit_vacant'
    )
  ),
  constraint notifications_origin_check check (origin in ('seed', 'app', 'plaid'))
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'notifications_user_dedupe_key'
      and conrelid = 'public.notifications'::regclass
  ) then
    alter table public.notifications
      add constraint notifications_user_dedupe_key unique (user_id, dedupe_key);
  end if;
end $$;

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id)
  where read_at is null and archived_at is null;

alter table public.notifications enable row level security;

drop policy if exists "Users can read own notifications" on public.notifications;
create policy "Users can read own notifications"
  on public.notifications for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can insert own notifications" on public.notifications;
create policy "Users can insert own notifications"
  on public.notifications for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can update own notifications" on public.notifications;
create policy "Users can update own notifications"
  on public.notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
