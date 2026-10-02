-- Phase 7: non-cash assets priced by the Navasan service

create table if not exists public.user_integrations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null default 'navasan',
  key_last4 text,
  key_status text not null default 'active' check (key_status in ('active','invalid','expired')),
  expires_on date,
  monthly_request_cap int not null default 100 check (monthly_request_cap between 1 and 10000),
  unit_divisor int not null default 1 check (unit_divisor in (1,10)),
  unit_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
revoke all on public.user_integrations from authenticated, anon;
grant select on public.user_integrations to authenticated;
grant update (expires_on, monthly_request_cap, unit_divisor, unit_confirmed, updated_at) on public.user_integrations to authenticated;
grant all on public.user_integrations to service_role;
alter table public.user_integrations enable row level security;
drop policy if exists "read own" on public.user_integrations;
create policy "read own" on public.user_integrations for select to authenticated using (user_id = auth.uid());
drop policy if exists "update own" on public.user_integrations;
create policy "update own" on public.user_integrations for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.user_secrets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null default 'navasan',
  api_key_encrypted text not null,
  created_at timestamptz not null default now()
);
revoke all on public.user_secrets from authenticated, anon;
grant all on public.user_secrets to service_role;
alter table public.user_secrets enable row level security;
-- No client policies: service role only.

create table if not exists public.price_cache (
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null check (symbol in ('usd_sell','eur','aed_sell','sekkeh','bahar','nim','rob','gerami','abshodeh','18ayar')),
  value_raw numeric not null,
  source_timestamp timestamptz,
  fetched_at timestamptz not null default now(),
  primary key (user_id, symbol)
);
revoke all on public.price_cache from authenticated, anon;
grant select on public.price_cache to authenticated;
grant all on public.price_cache to service_role;
alter table public.price_cache enable row level security;
drop policy if exists "read own" on public.price_cache;
create policy "read own" on public.price_cache for select to authenticated using (user_id = auth.uid());

create table if not exists public.price_fetch_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fetched_at timestamptz not null default now(),
  trigger text not null check (trigger in ('auto','manual','validate')),
  http_status int,
  ok boolean not null,
  error_code text
);
revoke all on public.price_fetch_log from authenticated, anon;
grant select on public.price_fetch_log to authenticated;
grant all on public.price_fetch_log to service_role;
alter table public.price_fetch_log enable row level security;
drop policy if exists "read own" on public.price_fetch_log;
create policy "read own" on public.price_fetch_log for select to authenticated using (user_id = auth.uid());
create index if not exists price_fetch_log_user_time on public.price_fetch_log (user_id, fetched_at desc);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  symbol text not null check (symbol in ('usd_sell','eur','aed_sell','sekkeh','bahar','nim','rob','gerami','abshodeh','18ayar')),
  quantity numeric(20,4) not null check (quantity > 0),
  label text check (label is null or char_length(label) <= 80),
  acquired_on date,
  cost_basis_toman bigint check (cost_basis_toman is null or cost_basis_toman >= 0),
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.assets to authenticated;
grant all on public.assets to service_role;
alter table public.assets enable row level security;
drop policy if exists "own rows" on public.assets;
create policy "own rows" on public.assets for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create index if not exists assets_user on public.assets (user_id);
