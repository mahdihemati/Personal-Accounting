-- Transfers between accounts: destination account for kind = 'transfer'
alter table public.transactions
  add column if not exists to_account_id uuid references public.accounts(id) on delete cascade;

alter table public.transactions drop constraint if exists transactions_transfer_check;
alter table public.transactions add constraint transactions_transfer_check check (
  (kind = 'transfer' and to_account_id is not null and to_account_id <> account_id)
  or (kind <> 'transfer' and to_account_id is null)
);
