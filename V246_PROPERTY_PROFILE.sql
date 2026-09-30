alter table public.properties
  add column if not exists property_profile jsonb not null default '{}'::jsonb;
