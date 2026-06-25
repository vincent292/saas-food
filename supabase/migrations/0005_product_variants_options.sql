create table if not exists product_variants (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  name text not null,
  description text,
  price_delta numeric(12,2) not null default 0,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists product_option_groups (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  name text not null,
  description text,
  min_choices integer not null default 0,
  max_choices integer not null default 1,
  is_required boolean not null default false,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (min_choices >= 0),
  check (max_choices >= 1),
  check (max_choices >= min_choices)
);

create table if not exists product_options (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  option_group_id uuid not null references product_option_groups(id) on delete cascade,
  name text not null,
  description text,
  price_delta numeric(12,2) not null default 0,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_product_variants_restaurant_product on product_variants(restaurant_id, product_id);
create index if not exists idx_product_option_groups_restaurant_product on product_option_groups(restaurant_id, product_id);
create index if not exists idx_product_options_restaurant_product on product_options(restaurant_id, product_id);
create index if not exists idx_product_options_group on product_options(option_group_id);

drop trigger if exists product_variants_updated_at on product_variants;
create trigger product_variants_updated_at before update on product_variants for each row execute function set_updated_at();
drop trigger if exists product_option_groups_updated_at on product_option_groups;
create trigger product_option_groups_updated_at before update on product_option_groups for each row execute function set_updated_at();
drop trigger if exists product_options_updated_at on product_options;
create trigger product_options_updated_at before update on product_options for each row execute function set_updated_at();

alter table product_variants enable row level security;
alter table product_option_groups enable row level security;
alter table product_options enable row level security;

drop policy if exists "public reads active product variants" on product_variants;
create policy "public reads active product variants" on product_variants for select using (
  is_active = true
  or is_superadmin()
  or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier','kitchen','waiter']::app_role[])
);

drop policy if exists "admins manage product variants" on product_variants;
create policy "admins manage product variants" on product_variants for all using (
  is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[])
) with check (
  is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[])
);

drop policy if exists "public reads active product option groups" on product_option_groups;
create policy "public reads active product option groups" on product_option_groups for select using (
  is_active = true
  or is_superadmin()
  or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier','kitchen','waiter']::app_role[])
);

drop policy if exists "admins manage product option groups" on product_option_groups;
create policy "admins manage product option groups" on product_option_groups for all using (
  is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[])
) with check (
  is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[])
);

drop policy if exists "public reads active product options" on product_options;
create policy "public reads active product options" on product_options for select using (
  is_active = true
  or is_superadmin()
  or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier','kitchen','waiter']::app_role[])
);

drop policy if exists "admins manage product options" on product_options;
create policy "admins manage product options" on product_options for all using (
  is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[])
) with check (
  is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[])
);
