-- Phase 3: voice token issuance log (rate limiting: 20 tokens / hour / user)
create table if not exists public.voice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists voice_sessions_user_created on public.voice_sessions (user_id, created_at desc);
grant select, insert on public.voice_sessions to authenticated;
grant all on public.voice_sessions to service_role;
alter table public.voice_sessions enable row level security;
drop policy if exists "own select" on public.voice_sessions;
create policy "own select" on public.voice_sessions for select to authenticated using (user_id = auth.uid());
drop policy if exists "own insert" on public.voice_sessions;
create policy "own insert" on public.voice_sessions for insert to authenticated with check (user_id = auth.uid());
