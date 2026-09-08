-- V2.2.8 polish + document connection
alter table public.transactions
  add column if not exists supporting_document_id uuid null references public.documents(id) on delete set null;

create index if not exists transactions_supporting_document_id_idx
  on public.transactions(supporting_document_id);
