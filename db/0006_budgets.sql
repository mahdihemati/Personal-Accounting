-- Monthly budgets: one limit per category per Jalali month (month = Gregorian date of the Jalali month's first day)
alter table public.budgets drop constraint if exists budgets_limit_positive;
alter table public.budgets add constraint budgets_limit_positive check (limit_amount > 0);
alter table public.budgets drop constraint if exists budgets_user_category_month_key;
alter table public.budgets add constraint budgets_user_category_month_key unique (user_id, category_id, month);
