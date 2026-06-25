create extension if not exists pgcrypto;

do $$ begin
  create type app_role as enum ('superadmin', 'restaurant_admin', 'cashier', 'kitchen', 'waiter');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type restaurant_status as enum ('active', 'inactive', 'suspended');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type order_status as enum ('pending', 'accepted', 'preparing', 'ready', 'delivered', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type order_type as enum ('table', 'delivery', 'pickup', 'pos');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type payment_status as enum ('pending', 'paid', 'cancelled', 'refunded');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type payment_method_type as enum ('cash', 'qr', 'bank_transfer', 'card', 'other');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type table_status as enum ('available', 'occupied', 'waiting_order', 'served', 'checkout_requested');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type cash_session_status as enum ('open', 'closed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type cash_movement_type as enum ('sale', 'expense', 'income', 'adjustment', 'opening', 'closing');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type inventory_movement_type as enum ('in', 'out', 'adjustment', 'waste', 'sale_usage');
exception when duplicate_object then null;
end $$;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  global_role app_role,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  status restaurant_status not null default 'active',
  logo_url text,
  banner_url text,
  primary_color text not null default '#1d8844',
  secondary_color text,
  whatsapp text,
  address text,
  city text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists restaurant_settings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null unique references restaurants(id) on delete cascade,
  delivery_enabled boolean not null default true,
  pickup_enabled boolean not null default true,
  table_orders_enabled boolean not null default true,
  inventory_enabled boolean not null default true,
  cash_enabled boolean not null default true,
  kitchen_enabled boolean not null default true,
  delivery_fee numeric(12,2) not null default 0,
  free_delivery_from numeric(12,2),
  min_order_amount numeric(12,2) not null default 0,
  currency text not null default 'BOB',
  qr_payment_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists restaurant_memberships (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, user_id, role)
);

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  description text,
  image_url text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  category_id uuid references categories(id) on delete set null,
  name text not null,
  description text,
  price numeric(12,2) not null check (price >= 0),
  image_url text,
  is_available boolean not null default true,
  is_featured boolean not null default false,
  track_stock boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  code text not null,
  status table_status not null default 'available',
  capacity integer not null default 2,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, code)
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  table_id uuid references tables(id) on delete set null,
  order_number text not null,
  customer_name text,
  customer_phone text,
  customer_address text,
  order_type order_type not null,
  status order_status not null default 'pending',
  payment_status payment_status not null default 'pending',
  payment_method payment_method_type not null default 'cash',
  subtotal numeric(12,2) not null default 0,
  delivery_fee numeric(12,2) not null default 0,
  discount_total numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  notes text,
  tracking_token text not null default md5(gen_random_uuid()::text || clock_timestamp()::text),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, order_number)
);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  product_name text not null,
  unit_price numeric(12,2) not null default 0,
  quantity integer not null check (quantity > 0),
  subtotal numeric(12,2) not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists payment_methods (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  type payment_method_type not null,
  name text not null,
  qr_image_url text,
  account_info text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists cash_sessions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  opened_by uuid references auth.users(id),
  closed_by uuid references auth.users(id),
  status cash_session_status not null default 'open',
  opening_amount numeric(12,2) not null default 0,
  expected_amount numeric(12,2) not null default 0,
  counted_amount numeric(12,2),
  difference_amount numeric(12,2),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  notes text
);

create table if not exists cash_movements (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  cash_session_id uuid references cash_sessions(id) on delete set null,
  order_id uuid references orders(id) on delete set null,
  type cash_movement_type not null,
  payment_method payment_method_type not null default 'cash',
  amount numeric(12,2) not null,
  description text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists inventory_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  unit text not null,
  current_stock numeric(12,3) not null default 0,
  min_stock numeric(12,3) not null default 0,
  unit_cost numeric(12,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists inventory_movements (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  inventory_item_id uuid not null references inventory_items(id) on delete cascade,
  type inventory_movement_type not null,
  quantity numeric(12,3) not null,
  previous_stock numeric(12,3) not null,
  new_stock numeric(12,3) not null,
  reason text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists business_hours (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  opens_at time,
  closes_at time,
  is_closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, day_of_week)
);

create table if not exists module_settings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  module_key text not null,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, module_key)
);

create index if not exists idx_restaurants_slug on restaurants(slug);
create index if not exists idx_memberships_user on restaurant_memberships(user_id, is_active);
create index if not exists idx_categories_restaurant on categories(restaurant_id);
create index if not exists idx_products_restaurant on products(restaurant_id);
create index if not exists idx_tables_restaurant on tables(restaurant_id);
create index if not exists idx_orders_restaurant_status on orders(restaurant_id, status);
create index if not exists idx_cash_movements_restaurant on cash_movements(restaurant_id, created_at desc);
create index if not exists idx_inventory_items_restaurant on inventory_items(restaurant_id);

drop trigger if exists profiles_updated_at on profiles;
create trigger profiles_updated_at before update on profiles for each row execute function set_updated_at();
drop trigger if exists restaurants_updated_at on restaurants;
create trigger restaurants_updated_at before update on restaurants for each row execute function set_updated_at();
drop trigger if exists restaurant_settings_updated_at on restaurant_settings;
create trigger restaurant_settings_updated_at before update on restaurant_settings for each row execute function set_updated_at();
drop trigger if exists restaurant_memberships_updated_at on restaurant_memberships;
create trigger restaurant_memberships_updated_at before update on restaurant_memberships for each row execute function set_updated_at();
drop trigger if exists categories_updated_at on categories;
create trigger categories_updated_at before update on categories for each row execute function set_updated_at();
drop trigger if exists products_updated_at on products;
create trigger products_updated_at before update on products for each row execute function set_updated_at();
drop trigger if exists tables_updated_at on tables;
create trigger tables_updated_at before update on tables for each row execute function set_updated_at();
drop trigger if exists orders_updated_at on orders;
create trigger orders_updated_at before update on orders for each row execute function set_updated_at();
drop trigger if exists payment_methods_updated_at on payment_methods;
create trigger payment_methods_updated_at before update on payment_methods for each row execute function set_updated_at();
drop trigger if exists inventory_items_updated_at on inventory_items;
create trigger inventory_items_updated_at before update on inventory_items for each row execute function set_updated_at();
drop trigger if exists business_hours_updated_at on business_hours;
create trigger business_hours_updated_at before update on business_hours for each row execute function set_updated_at();
drop trigger if exists module_settings_updated_at on module_settings;
create trigger module_settings_updated_at before update on module_settings for each row execute function set_updated_at();

create or replace function is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and global_role = 'superadmin'
  );
$$;

create or replace function has_restaurant_role(target_restaurant_id uuid, allowed_roles app_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from restaurant_memberships
    where restaurant_id = target_restaurant_id
      and user_id = auth.uid()
      and is_active = true
      and role = any(allowed_roles)
  );
$$;

alter table profiles enable row level security;
alter table restaurants enable row level security;
alter table restaurant_settings enable row level security;
alter table restaurant_memberships enable row level security;
alter table categories enable row level security;
alter table products enable row level security;
alter table tables enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table payment_methods enable row level security;
alter table cash_sessions enable row level security;
alter table cash_movements enable row level security;
alter table inventory_items enable row level security;
alter table inventory_movements enable row level security;
alter table business_hours enable row level security;
alter table module_settings enable row level security;

drop policy if exists "profiles own or superadmin" on profiles;
create policy "profiles own or superadmin" on profiles for select using (id = auth.uid() or is_superadmin());
drop policy if exists "superadmin manages profiles" on profiles;
create policy "superadmin manages profiles" on profiles for all using (is_superadmin()) with check (is_superadmin());

drop policy if exists "public reads active restaurants" on restaurants;
create policy "public reads active restaurants" on restaurants for select using (status = 'active' or is_superadmin() or has_restaurant_role(id, array['restaurant_admin','cashier','kitchen','waiter']::app_role[]));
drop policy if exists "superadmin manages restaurants" on restaurants;
create policy "superadmin manages restaurants" on restaurants for all using (is_superadmin()) with check (is_superadmin());

drop policy if exists "members read settings" on restaurant_settings;
create policy "members read settings" on restaurant_settings for select using (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier','kitchen','waiter']::app_role[]));
drop policy if exists "admins manage settings" on restaurant_settings;
create policy "admins manage settings" on restaurant_settings for all using (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[])) with check (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[]));

drop policy if exists "superadmin or restaurant admin memberships" on restaurant_memberships;
create policy "superadmin or restaurant admin memberships" on restaurant_memberships for all using (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[])) with check (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[]));

drop policy if exists "public reads active categories" on categories;
create policy "public reads active categories" on categories for select using (is_active = true or is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier','kitchen','waiter']::app_role[]));
drop policy if exists "admins manage categories" on categories;
create policy "admins manage categories" on categories for all using (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[])) with check (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[]));

drop policy if exists "public reads available products" on products;
create policy "public reads available products" on products for select using (is_available = true or is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier','kitchen','waiter']::app_role[]));
drop policy if exists "admins manage products" on products;
create policy "admins manage products" on products for all using (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[])) with check (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[]));

drop policy if exists "members read tables" on tables;
create policy "members read tables" on tables for select using (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier','waiter']::app_role[]));
drop policy if exists "admins and waiters manage tables" on tables;
create policy "admins and waiters manage tables" on tables for all using (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','waiter']::app_role[])) with check (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','waiter']::app_role[]));

drop policy if exists "public creates orders" on orders;
create policy "public creates orders" on orders for insert with check (true);
drop policy if exists "members read orders" on orders;
create policy "members read orders" on orders for select using (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier','kitchen','waiter']::app_role[]));
drop policy if exists "members update orders" on orders;
create policy "members update orders" on orders for update using (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier','kitchen','waiter']::app_role[])) with check (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier','kitchen','waiter']::app_role[]));

drop policy if exists "public creates order items" on order_items;
create policy "public creates order items" on order_items for insert with check (true);
drop policy if exists "members read order items" on order_items;
create policy "members read order items" on order_items for select using (
  exists (
    select 1 from orders
    where orders.id = order_items.order_id
      and (is_superadmin() or has_restaurant_role(orders.restaurant_id, array['restaurant_admin','cashier','kitchen','waiter']::app_role[]))
  )
);

drop policy if exists "members read payment methods" on payment_methods;
create policy "members read payment methods" on payment_methods for select using (is_active = true or is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier']::app_role[]));
drop policy if exists "admins manage payment methods" on payment_methods;
create policy "admins manage payment methods" on payment_methods for all using (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[])) with check (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[]));

drop policy if exists "cash roles manage sessions" on cash_sessions;
create policy "cash roles manage sessions" on cash_sessions for all using (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier']::app_role[])) with check (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier']::app_role[]));
drop policy if exists "cash roles manage movements" on cash_movements;
create policy "cash roles manage movements" on cash_movements for all using (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier']::app_role[])) with check (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier']::app_role[]));

drop policy if exists "members read inventory" on inventory_items;
create policy "members read inventory" on inventory_items for select using (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier']::app_role[]));
drop policy if exists "admins manage inventory" on inventory_items;
create policy "admins manage inventory" on inventory_items for all using (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[])) with check (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[]));
drop policy if exists "members read inventory movements" on inventory_movements;
create policy "members read inventory movements" on inventory_movements for select using (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier']::app_role[]));
drop policy if exists "admins manage inventory movements" on inventory_movements;
create policy "admins manage inventory movements" on inventory_movements for all using (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[])) with check (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[]));

drop policy if exists "public reads business hours" on business_hours;
create policy "public reads business hours" on business_hours for select using (true);
drop policy if exists "admins manage business hours" on business_hours;
create policy "admins manage business hours" on business_hours for all using (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[])) with check (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[]));

drop policy if exists "members read modules" on module_settings;
create policy "members read modules" on module_settings for select using (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier','kitchen','waiter']::app_role[]));
drop policy if exists "admins manage modules" on module_settings;
create policy "admins manage modules" on module_settings for all using (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[])) with check (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[]));
