-- Phase 6: unusual-spending alerts and decision log

alter table public.transactions add column if not exists exclude_from_baseline boolean not null default false;
alter table public.categories add column if not exists alerts_muted boolean not null default false;
alter table public.user_settings
  add column if not exists alerts_enabled boolean not null default true,
  add column if not exists alerts_last_checked_on date;

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('large_transaction','category_pace','possible_duplicate')),
  transaction_id uuid references public.transactions(id) on delete cascade,
  category_id uuid references public.categories(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'new' check (status in ('new','seen','dismissed','intentional')),
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.alerts to authenticated;
grant all on public.alerts to service_role;
alter table public.alerts enable row level security;
drop policy if exists "own rows" on public.alerts;
create policy "own rows" on public.alerts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create index if not exists alerts_user_status on public.alerts (user_id, status);
-- No duplicate alert for the same transaction and kind
create unique index if not exists alerts_tx_kind on public.alerts (transaction_id, kind) where transaction_id is not null;

create table if not exists public.decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  amount_toman bigint not null check (amount_toman > 0),
  category_id uuid references public.categories(id) on delete set null,
  choice text not null check (choice in ('bought','postponed','skipped')),
  reason text check (reason is null or char_length(reason) <= 200),
  decided_at timestamptz not null default now(),
  review_at timestamptz,
  review_rating text check (review_rating in ('worth','neutral','regret')),
  review_note text check (review_note is null or char_length(review_note) <= 200),
  transaction_id uuid references public.transactions(id) on delete set null
);
grant select, insert, update, delete on public.decisions to authenticated;
grant all on public.decisions to service_role;
alter table public.decisions enable row level security;
drop policy if exists "own rows" on public.decisions;
create policy "own rows" on public.decisions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create index if not exists decisions_user_review on public.decisions (user_id, review_at);
