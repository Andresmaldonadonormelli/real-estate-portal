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
