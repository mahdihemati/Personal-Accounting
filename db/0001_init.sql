create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('cash','card','wallet')),
  initial_balance bigint not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('income','expense')),
  icon text, color text
);
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  amount bigint not null check (amount >= 0),
  kind text not null check (kind in ('income','expense','transfer')),
  occurred_at timestamptz not null default now(),
  note text,
  source text not null default 'manual' check (source in ('manual','voice','import')),
  raw_transcript text,
  created_at timestamptz not null default now()
);
create index if not exists transactions_user_time on public.transactions(user_id, occurred_at desc);
create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  month date not null,
  limit_amount bigint not null
);
create table if not exists public.ai_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  summary text, payload jsonb,
  created_at timestamptz not null default now()
);
do $$ declare t text; begin
  foreach t in array array['accounts','categories','transactions','budgets','ai_insights'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
create or replace function public.ensure_defaults()
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return; end if;
  if not exists (select 1 from accounts where user_id = uid) then
    insert into accounts(user_id, name, type) values (uid, 'نقد', 'cash');
  end if;
  if not exists (select 1 from categories where user_id = uid) then
    insert into categories(user_id, name, kind, icon, color) values
      (uid,'خوراک','expense','utensils','#f59e0b'),
      (uid,'حمل‌ونقل','expense','car','#3b82f6'),
      (uid,'قبوض','expense','receipt','#8b5cf6'),
      (uid,'اجاره','expense','home','#ef4444'),
      (uid,'سلامت','expense','heart-pulse','#ec4899'),
      (uid,'تفریح','expense','gamepad-2','#14b8a6'),
      (uid,'حقوق','income','wallet','#10b981'),
      (uid,'سایر','expense','circle-ellipsis','#64748b');
  end if;
end $$;
revoke all on function public.ensure_defaults() from public, anon;
grant execute on function public.ensure_defaults() to authenticated;
