create table if not exists public.platform_delivery_rate_tiers (
  id uuid primary key default gen_random_uuid(),
  min_distance_km numeric(6, 1) not null,
  max_distance_km numeric(6, 1) not null,
  delivery_fee numeric(12, 2) not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_delivery_rate_distance_check check (
    min_distance_km >= 0 and max_distance_km >= min_distance_km
  ),
  constraint platform_delivery_rate_fee_check check (delivery_fee >= 0),
  constraint platform_delivery_rate_unique_range unique (min_distance_km, max_distance_km)
);

alter table public.platform_delivery_rate_tiers enable row level security;

insert into public.platform_delivery_rate_tiers (min_distance_km, max_distance_km, delivery_fee, sort_order)
values
  (0.0, 0.9, 10, 10),
  (1.0, 2.9, 12, 20),
  (3.0, 4.9, 15, 30),
  (5.0, 6.9, 18, 40),
  (7.0, 8.9, 22, 50),
  (9.0, 10.9, 27, 60),
  (11.0, 12.9, 30, 70),
  (13.0, 13.9, 35, 80),
  (14.0, 14.9, 37, 90)
on conflict (min_distance_km, max_distance_km) do update
set delivery_fee = excluded.delivery_fee,
    is_active = true,
    sort_order = excluded.sort_order,
    updated_at = now();

create index if not exists platform_delivery_rate_tiers_active_order_idx
  on public.platform_delivery_rate_tiers (is_active, sort_order, min_distance_km);

