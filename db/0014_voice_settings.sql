-- Per-user voice assistant settings (model, voice, turn detection, reply length).
create table if not exists public.voice_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  model text,
  voice_name text,
  start_sensitivity text not null default 'high' check (start_sensitivity in ('low','high')),
  end_sensitivity text not null default 'high' check (end_sensitivity in ('low','high')),
  silence_ms int not null default 500 check (silence_ms between 300 and 1500),
  reply_length text not null default 'short' check (reply_length in ('short','normal')),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.voice_settings to authenticated;
grant all on public.voice_settings to service_role;
alter table public.voice_settings enable row level security;
drop policy if exists "own voice settings" on public.voice_settings;
create policy "own voice settings" on public.voice_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
