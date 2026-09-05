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
