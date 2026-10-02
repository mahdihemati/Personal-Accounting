-- Phase 4: necessity labels, monthly financial plan, idempotent voice batches

-- A) Essential / flexible labels
alter table public.categories
  add column if not exists necessity text not null default 'flexible'
  check (necessity in ('essential','flexible'));
alter table public.transactions
  add column if not exists necessity_override text
  check (necessity_override in ('essential','flexible'));

update public.categories set necessity = 'essential'
  where kind = 'expense' and name in ('اجاره','قبوض','سلامت','خوراک');

-- Idempotent voice batch inserts
alter table public.transactions add column if not exists batch_id uuid;
alter table public.transactions add column if not exists batch_index smallint;
create unique index if not exists transactions_batch_unique
  on public.transactions(batch_id, batch_index) where batch_id is not null;

-- B) Monthly financial plan
create table if not exists public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  monthly_income_expected bigint check (monthly_income_expected >= 0),
  savings_target bigint check (savings_target >= 0),
  monthly_essential_expected bigint check (monthly_essential_expected >= 0),
  review_categories_seen boolean not null default false,
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.user_settings to authenticated;
grant all on public.user_settings to service_role;
alter table public.user_settings enable row level security;
drop policy if exists "own rows" on public.user_settings;
create policy "own rows" on public.user_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Defaults for new users now carry necessity labels
create or replace function public.ensure_defaults()
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return; end if;
  if not exists (select 1 from accounts where user_id = uid) then
    insert into accounts(user_id, name, type) values (uid, 'نقد', 'cash');
  end if;
  if not exists (select 1 from categories where user_id = uid) then
    insert into categories(user_id, name, kind, icon, color, necessity) values
      (uid,'خوراک','expense','utensils','#f59e0b','essential'),
      (uid,'حمل‌ونقل','expense','car','#3b82f6','flexible'),
      (uid,'قبوض','expense','receipt','#8b5cf6','essential'),
      (uid,'اجاره','expense','home','#ef4444','essential'),
      (uid,'سلامت','expense','heart-pulse','#ec4899','essential'),
      (uid,'تفریح','expense','gamepad-2','#14b8a6','flexible'),
      (uid,'حقوق','income','wallet','#10b981','flexible'),
      (uid,'سایر','expense','circle-ellipsis','#64748b','flexible');
  end if;
end $$;
revoke all on function public.ensure_defaults() from public, anon;
grant execute on function public.ensure_defaults() to authenticated;
