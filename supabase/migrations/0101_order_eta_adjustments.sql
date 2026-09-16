alter table public.orders
  add column if not exists eta_adjustment_minutes integer not null default 0,
  add column if not exists eta_adjusted_at timestamptz,
  add column if not exists eta_adjusted_by uuid references auth.users(id) on delete set null;

alter table public.orders
  drop constraint if exists orders_eta_adjustment_minutes_check,
  add constraint orders_eta_adjustment_minutes_check
    check (eta_adjustment_minutes between 0 and 180);

