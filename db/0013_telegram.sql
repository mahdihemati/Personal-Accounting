-- Telegram bot: per-user bot token (encrypted), chat link, drafts awaiting confirmation.

alter table public.transactions drop constraint if exists transactions_source_check;
alter table public.transactions add constraint transactions_source_check
  check (source in ('manual','voice','import','telegram'));

create table if not exists public.telegram_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  webhook_id uuid not null unique default gen_random_uuid(),
  webhook_secret text not null,
  bot_token_encrypted text not null,
  token_last4 text not null,
  bot_username text,
  webhook_url text,
  chat_id bigint,
  link_code text,
  link_code_expires timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
revoke all on public.telegram_links from authenticated, anon;
grant all on public.telegram_links to service_role;
alter table public.telegram_links enable row level security;
-- No client policies: read through server functions only.

create table if not exists public.telegram_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  chat_id bigint not null,
  items jsonb not null default '[]'::jsonb,
  question text,
  status text not null default 'collecting' check (status in ('collecting','pending','saved','cancelled')),
  message_id bigint,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);
create index if not exists telegram_drafts_user on public.telegram_drafts(user_id, created_at desc);
revoke all on public.telegram_drafts from authenticated, anon;
grant all on public.telegram_drafts to service_role;
alter table public.telegram_drafts enable row level security;

create table if not exists public.telegram_updates (
  webhook_id uuid not null,
  update_id bigint not null,
  created_at timestamptz not null default now(),
  primary key (webhook_id, update_id)
);
revoke all on public.telegram_updates from authenticated, anon;
grant all on public.telegram_updates to service_role;
alter table public.telegram_updates enable row level security;
