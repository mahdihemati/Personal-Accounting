-- Full (non-partial) unique index so upsert ON CONFLICT (batch_id, batch_index) works; NULLs stay distinct.
drop index if exists public.transactions_batch_unique;
create unique index if not exists transactions_batch_unique on public.transactions(batch_id, batch_index);
