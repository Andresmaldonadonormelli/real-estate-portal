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
