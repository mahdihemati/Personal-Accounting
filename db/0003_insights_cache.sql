-- Tracks the last time a user's transactions changed, for AI insight cache invalidation.
create table if not exists public.finance_data_versions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  changed_at timestamptz not null default now()
);
grant select on public.finance_data_versions to authenticated;
grant all on public.finance_data_versions to service_role;
alter table public.finance_data_versions enable row level security;
drop policy if exists "own version" on public.finance_data_versions;
create policy "own version" on public.finance_data_versions for select to authenticated using (user_id = auth.uid());

create or replace function public.bump_finance_version()
returns trigger language plpgsql security definer set search_path = public as $$
declare uid uuid := coalesce(new.user_id, old.user_id);
begin
  insert into finance_data_versions(user_id, changed_at) values (uid, clock_timestamp())
  on conflict (user_id) do update set changed_at = excluded.changed_at;
  return null;
end $$;
revoke all on function public.bump_finance_version() from public, anon, authenticated;

drop trigger if exists transactions_bump_version on public.transactions;
create trigger transactions_bump_version after insert or update or delete on public.transactions
for each row execute function public.bump_finance_version();
