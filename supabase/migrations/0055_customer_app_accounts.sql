create table if not exists customer_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text not null,
  phone_normalized text generated always as (regexp_replace(coalesce(phone, ''), '\D', '', 'g')) stored,
  document_number text not null,
  document_number_normalized text generated always as (upper(regexp_replace(coalesce(document_number, ''), '[^0-9A-Za-z]', '', 'g'))) stored,
  provider text not null default 'email' check (provider in ('email', 'google')),
  status text not null default 'active' check (status in ('active', 'blocked')),
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_profiles_phone_digits check (length(phone_normalized) >= 6),
  constraint customer_profiles_document_digits check (length(document_number_normalized) >= 4)
);

create unique index if not exists customer_profiles_email_unique
  on customer_profiles (lower(email));

create unique index if not exists customer_profiles_phone_unique
  on customer_profiles (phone_normalized);

create unique index if not exists customer_profiles_document_unique
  on customer_profiles (document_number_normalized);

drop trigger if exists customer_profiles_updated_at on customer_profiles;
create trigger customer_profiles_updated_at before update on customer_profiles for each row execute function set_updated_at();

alter table customer_profiles enable row level security;

drop policy if exists "customers read own profile" on customer_profiles;
create policy "customers read own profile" on customer_profiles
  for select using (id = auth.uid() or is_superadmin());

drop policy if exists "customers update own profile" on customer_profiles;
create policy "customers update own profile" on customer_profiles
  for update using (id = auth.uid() or is_superadmin()) with check (id = auth.uid() or is_superadmin());

drop policy if exists "superadmin manages customer profiles" on customer_profiles;
create policy "superadmin manages customer profiles" on customer_profiles
  for all using (is_superadmin()) with check (is_superadmin());

create table if not exists customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customer_profiles(id) on delete cascade,
  label text not null default 'Direccion',
  address text not null,
  latitude numeric(10,7),
  longitude numeric(10,7),
  maps_url text,
  city text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_addresses_customer_idx on customer_addresses (customer_id, updated_at desc);
create unique index if not exists customer_addresses_one_default_idx on customer_addresses (customer_id) where is_default;

drop trigger if exists customer_addresses_updated_at on customer_addresses;
create trigger customer_addresses_updated_at before update on customer_addresses for each row execute function set_updated_at();

alter table customer_addresses enable row level security;

drop policy if exists "customers read own addresses" on customer_addresses;
create policy "customers read own addresses" on customer_addresses
  for select using (customer_id = auth.uid() or is_superadmin());

drop policy if exists "customers insert own addresses" on customer_addresses;
create policy "customers insert own addresses" on customer_addresses
  for insert with check (customer_id = auth.uid() or is_superadmin());

drop policy if exists "customers update own addresses" on customer_addresses;
create policy "customers update own addresses" on customer_addresses
  for update using (customer_id = auth.uid() or is_superadmin()) with check (customer_id = auth.uid() or is_superadmin());

drop policy if exists "customers delete own addresses" on customer_addresses;
create policy "customers delete own addresses" on customer_addresses
  for delete using (customer_id = auth.uid() or is_superadmin());
