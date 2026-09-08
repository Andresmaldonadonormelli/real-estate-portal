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
