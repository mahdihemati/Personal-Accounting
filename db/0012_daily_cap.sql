-- Phase 7 tweak: up to 3 price fetches/day => default monthly cap 90.
alter table public.user_integrations alter column monthly_request_cap set default 90;
update public.user_integrations set monthly_request_cap = 90 where monthly_request_cap = 100;
