alter table order_delivery_links
  alter column expires_at set default ((date_trunc('day', timezone('America/La_Paz', now())) + interval '1 day') at time zone 'America/La_Paz');

create or replace function expire_old_delivery_links()
returns void
language sql
security definer
set search_path = public
as $$
  update order_delivery_links
  set status = 'expired'
  where status in ('active', 'arrived')
    and expires_at < now();
$$;

create table if not exists restaurant_public_visits (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  visited_at timestamptz not null default now()
);

create index if not exists idx_public_visits_restaurant_week on restaurant_public_visits(restaurant_id, visited_at desc);
create index if not exists idx_public_visits_visited_at on restaurant_public_visits(visited_at desc);

alter table restaurant_public_visits enable row level security;

drop policy if exists "public insert restaurant visits" on restaurant_public_visits;
create policy "public insert restaurant visits" on restaurant_public_visits for insert with check (true);

drop policy if exists "public read restaurant visit counts" on restaurant_public_visits;
create policy "public read restaurant visit counts" on restaurant_public_visits for select using (true);

grant execute on function expire_old_delivery_links() to anon, authenticated;
