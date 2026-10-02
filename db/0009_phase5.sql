-- Phase 5: learning path, financial vitals settings, weekly reports

-- Settings
alter table public.user_settings
  add column if not exists emergency_fund_target_months smallint not null default 3
    check (emergency_fund_target_months between 1 and 24),
  add column if not exists report_weekday smallint not null default 5
    check (report_weekday between 0 and 6); -- 0 = Saturday … 6 = Friday

-- Transactions get updated_at so weekly-report caching notices edits
alter table public.transactions add column if not exists updated_at timestamptz not null default now();
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists transactions_touch on public.transactions;
create trigger transactions_touch before update on public.transactions
  for each row execute function public.touch_updated_at();

-- Lessons (read-only for signed-in users; written only with the service role)
create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  phase smallint not null,
  sort_order smallint not null,
  title text not null,
  summary text,
  outline jsonb,
  status text not null default 'coming_soon' check (status in ('available','coming_soon'))
);
grant select on public.lessons to authenticated;
grant all on public.lessons to service_role;
alter table public.lessons enable row level security;
drop policy if exists "read lessons" on public.lessons;
create policy "read lessons" on public.lessons for select to authenticated using (true);

create table if not exists public.lesson_content (
  lesson_id uuid primary key references public.lessons(id) on delete cascade,
  body jsonb not null,
  quiz jsonb not null,
  generated_at timestamptz not null default now()
);
grant select on public.lesson_content to authenticated;
grant all on public.lesson_content to service_role;
alter table public.lesson_content enable row level security;
drop policy if exists "read lesson content" on public.lesson_content;
create policy "read lesson content" on public.lesson_content for select to authenticated using (true);

create table if not exists public.lesson_progress (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  status text not null check (status in ('opened','completed')),
  quiz_score smallint,
  quiz_total smallint,
  completed_at timestamptz,
  primary key (user_id, lesson_id)
);
grant select, insert, update, delete on public.lesson_progress to authenticated;
grant all on public.lesson_progress to service_role;
alter table public.lesson_progress enable row level security;
drop policy if exists "own rows" on public.lesson_progress;
create policy "own rows" on public.lesson_progress for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Weekly reports
create table if not exists public.weekly_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  week_start date not null,
  week_end date not null,
  metrics jsonb not null,
  narrative jsonb,
  experiment jsonb,
  experiment_result jsonb,
  data_hash text not null,
  created_at timestamptz not null default now(),
  unique (user_id, week_end)
);
grant select, insert, update, delete on public.weekly_reports to authenticated;
grant all on public.weekly_reports to service_role;
alter table public.weekly_reports enable row level security;
drop policy if exists "own rows" on public.weekly_reports;
create policy "own rows" on public.weekly_reports for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Seed lessons
insert into public.lessons (slug, phase, sort_order, title, summary, outline, status) values
('runway', 1, 1, 'Runway: چند ماه دوام می‌آوری؟',
 'نقد در دسترس تقسیم بر هزینه‌ی ضروری ماهانه.',
 $j${
  "concept": "Runway یعنی نقد در دسترس تقسیم بر هزینه‌ی ضروری ماهانه؛ چند ماه می‌توانی بدون هیچ درآمدی ادامه بدهی.",
  "key_points": ["نقد در دسترس یعنی چیزی که ظرف چند روز می‌شود خرجش کرد، نه دارایی قفل‌شده", "فقط هزینه‌های ضروری حساب می‌شود، نه همه‌ی هزینه‌ها", "این عدد قضاوت نیست، نقطه‌ی شروع است", "دو راه بالا بردنش: نقد بیشتر یا هزینه‌ی ضروری کمتر"],
  "analogy": "نقد مثل بنزین باک است، هزینه‌ی ضروری ماهانه مثل مصرف بنزین؛ Runway یعنی با باک فعلی چند ماه می‌رانی تا خالی شود.",
  "common_mistakes": ["حساب کردن همه‌ی هزینه‌ها به‌جای فقط ضروری‌ها", "نقد حساب کردن دارایی‌ای که فروش سریعش دردسر یا ضرر دارد"],
  "local_note": "اگر درآمدت ثابت نیست، عدد مطمئن‌تری لازم داری. در اقتصاد با تورم بالا، نقد تومانی با گذر زمان ارزشش کم می‌شود؛ این موضوع در درس تورم بررسی می‌شود.",
  "metric_keys": ["runway_months","liquid_balance","essential_monthly"]
 }$j$::jsonb, 'available'),
('room-for-error', 1, 2, 'حاشیه‌ی اشتباه (Room for Error)',
 'فاصله‌ی امن بین برنامه و بدترین حالت معقول.',
 $j${
  "concept": "نمی‌توانی آینده را دقیق پیش‌بینی کنی، پس به‌جای تخمین دقیق، فاصله‌ی امنی بین برنامه و بدترین حالت معقول نگه می‌داری.",
  "key_points": ["اشتباه در تخمین قطعی است؛ سوال این است که با اشتباه زنده می‌مانی یا نه", "حاشیه‌ی امن یعنی برنامه را روی بهترین حالت نبندی", "در بودجه: بخشی را برای ناشناخته‌ها کنار بگذار و کمتر از سقف خرج کن", "حاشیه را برای خرج بیشتر مصرف نکن"],
  "analogy": "مثل سفر به یک قرار مهم: زمان رسیدن را تخمین می‌زنی و بعد ۳۰ تا ۴۰ درصد اضافه می‌کنی چون ترافیک یا تصادف هر لحظه ممکن است.",
  "common_mistakes": ["برنامه‌ریزی بر اساس بهترین حالت", "تبدیل حاشیه‌ی امن به بودجه‌ی خرج"],
  "local_note": "شوک‌های قیمتی و درآمدی در اقتصاد ما بزرگ‌تر از میانگین جهانی است؛ حاشیه‌ی امن را سخاوتمندانه‌تر بگیر. (این درس از ایده‌ی کتاب روان‌شناسی پول الهام گرفته و با شرایط محلی تطبیق داده شده.)",
  "metric_keys": ["runway_months","savings_rate_month"]
 }$j$::jsonb, 'available'),
('cash-flow', 2, 3, 'جریان نقدی', null, null, 'coming_soon'),
('budgeting', 2, 4, 'بودجه‌بندی', null, null, 'coming_soon'),
('inflation', 3, 5, 'تورم و قدرت خرید', null, null, 'coming_soon'),
('goal-setting', 3, 6, 'هدف‌گذاری مالی', null, null, 'coming_soon'),
('investing-intro', 4, 7, 'آشنایی با سرمایه‌گذاری', null, null, 'coming_soon')
on conflict (slug) do update set phase = excluded.phase, sort_order = excluded.sort_order,
  title = excluded.title, summary = excluded.summary, outline = excluded.outline, status = excluded.status;
