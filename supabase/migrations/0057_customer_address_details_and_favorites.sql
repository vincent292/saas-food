alter table customer_addresses
  add column if not exists apartment text,
  add column if not exists building_name text,
  add column if not exists reference text;

create table if not exists customer_favorites (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customer_profiles(id) on delete cascade,
  kind text not null check (kind in ('restaurant', 'product')),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  product_id uuid references products(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint customer_favorites_entity_check check (
    (kind = 'restaurant' and product_id is null)
    or (kind = 'product' and product_id is not null)
  )
);

create index if not exists customer_favorites_customer_idx
  on customer_favorites (customer_id, created_at desc);

create unique index if not exists customer_favorites_restaurant_unique
  on customer_favorites (customer_id, restaurant_id)
  where kind = 'restaurant';

create unique index if not exists customer_favorites_product_unique
  on customer_favorites (customer_id, product_id)
  where kind = 'product';

alter table customer_favorites enable row level security;

drop policy if exists "customers read own favorites" on customer_favorites;
create policy "customers read own favorites" on customer_favorites
  for select using (customer_id = auth.uid() or is_superadmin());

drop policy if exists "customers insert own favorites" on customer_favorites;
create policy "customers insert own favorites" on customer_favorites
  for insert with check (customer_id = auth.uid() or is_superadmin());

drop policy if exists "customers delete own favorites" on customer_favorites;
create policy "customers delete own favorites" on customer_favorites
  for delete using (customer_id = auth.uid() or is_superadmin());

drop policy if exists "superadmin manages customer favorites" on customer_favorites;
create policy "superadmin manages customer favorites" on customer_favorites
  for all using (is_superadmin()) with check (is_superadmin());
