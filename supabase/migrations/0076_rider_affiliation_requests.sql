create table if not exists platform_rider_payment_settings (
  id boolean primary key default true check (id),
  amount numeric(10,2) not null default 30 check (amount >= 0),
  currency text not null default 'BOB',
  qr_url text,
  qr_note text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into platform_rider_payment_settings (id, amount, currency)
values (true, 30, 'BOB')
on conflict (id) do nothing;

drop trigger if exists platform_rider_payment_settings_updated_at on platform_rider_payment_settings;
create trigger platform_rider_payment_settings_updated_at
  before update on platform_rider_payment_settings
  for each row execute function set_updated_at();

create table if not exists restaurant_rider_invites (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null unique references restaurants(id) on delete cascade,
  invite_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_restaurant_rider_invites_token
  on restaurant_rider_invites(invite_token)
  where is_active = true;

drop trigger if exists restaurant_rider_invites_updated_at on restaurant_rider_invites;
create trigger restaurant_rider_invites_updated_at
  before update on restaurant_rider_invites
  for each row execute function set_updated_at();

create table if not exists rider_applications (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references restaurant_rider_invites(id) on delete cascade,
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text not null,
  document_number text not null,
  document_number_normalized text generated always as (upper(regexp_replace(coalesce(document_number, ''), '[^0-9A-Za-z]', '', 'g'))) stored,
  plate_number text not null,
  plate_number_normalized text generated always as (upper(regexp_replace(coalesce(plate_number, ''), '[^0-9A-Za-z]', '', 'g'))) stored,
  vehicle_owner_name text not null,
  ruat_number text not null,
  ci_front_url text not null,
  ci_back_url text not null,
  ruat_front_url text not null,
  ruat_back_url text not null,
  owner_document_url text not null,
  plate_photo_url text not null,
  payment_proof_url text not null,
  payment_proof_file_name text,
  payment_proof_file_size bigint not null default 0,
  payment_amount numeric(10,2) not null default 30,
  payment_currency text not null default 'BOB',
  payment_qr_url text,
  payment_qr_note text,
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'rejected')),
  rider_user_id uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rider_applications_email_check check (position('@' in email) > 1),
  constraint rider_applications_document_check check (length(document_number_normalized) >= 4),
  constraint rider_applications_plate_check check (length(plate_number_normalized) >= 4)
);

create index if not exists idx_rider_applications_restaurant_status
  on rider_applications(restaurant_id, status, created_at desc);

create index if not exists idx_rider_applications_created
  on rider_applications(created_at desc);

create unique index if not exists idx_rider_applications_active_document
  on rider_applications(restaurant_id, document_number_normalized)
  where status in ('submitted', 'approved');

create unique index if not exists idx_rider_applications_active_plate
  on rider_applications(restaurant_id, plate_number_normalized)
  where status in ('submitted', 'approved');

drop trigger if exists rider_applications_updated_at on rider_applications;
create trigger rider_applications_updated_at
  before update on rider_applications
  for each row execute function set_updated_at();

create table if not exists restaurant_riders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  rider_application_id uuid not null unique references rider_applications(id) on delete restrict,
  rider_user_id uuid references auth.users(id) on delete set null,
  full_name text not null,
  email text not null,
  phone text not null,
  document_number text not null,
  plate_number text not null,
  vehicle_owner_name text not null,
  ruat_number text not null,
  status text not null default 'active' check (status in ('active', 'suspended')),
  membership_amount numeric(10,2) not null default 30,
  membership_currency text not null default 'BOB',
  membership_started_at timestamptz not null default now(),
  membership_valid_until date not null default ((now() + interval '1 month')::date),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_restaurant_riders_restaurant_status
  on restaurant_riders(restaurant_id, status, membership_valid_until);

create unique index if not exists idx_restaurant_riders_restaurant_document
  on restaurant_riders(restaurant_id, upper(regexp_replace(coalesce(document_number, ''), '[^0-9A-Za-z]', '', 'g')));

create unique index if not exists idx_restaurant_riders_restaurant_plate
  on restaurant_riders(restaurant_id, upper(regexp_replace(coalesce(plate_number, ''), '[^0-9A-Za-z]', '', 'g')));

drop trigger if exists restaurant_riders_updated_at on restaurant_riders;
create trigger restaurant_riders_updated_at
  before update on restaurant_riders
  for each row execute function set_updated_at();

alter table platform_rider_payment_settings enable row level security;
alter table restaurant_rider_invites enable row level security;
alter table rider_applications enable row level security;
alter table restaurant_riders enable row level security;

drop policy if exists "authenticated read rider payment settings" on platform_rider_payment_settings;
create policy "authenticated read rider payment settings" on platform_rider_payment_settings
  for select to authenticated using (true);

drop policy if exists "superadmin manages rider payment settings" on platform_rider_payment_settings;
create policy "superadmin manages rider payment settings" on platform_rider_payment_settings
  for all using (is_superadmin()) with check (is_superadmin());

drop policy if exists "members read rider invites" on restaurant_rider_invites;
create policy "members read rider invites" on restaurant_rider_invites
  for select using (
    is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier']::app_role[])
  );

drop policy if exists "admins manage rider invites" on restaurant_rider_invites;
create policy "admins manage rider invites" on restaurant_rider_invites
  for all using (
    is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[])
  ) with check (
    is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[])
  );

drop policy if exists "members read rider applications" on rider_applications;
create policy "members read rider applications" on rider_applications
  for select using (
    is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[])
  );

drop policy if exists "superadmin manages rider applications" on rider_applications;
create policy "superadmin manages rider applications" on rider_applications
  for all using (is_superadmin()) with check (is_superadmin());

drop policy if exists "members read restaurant riders" on restaurant_riders;
create policy "members read restaurant riders" on restaurant_riders
  for select using (
    is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier']::app_role[])
  );

drop policy if exists "superadmin manages restaurant riders" on restaurant_riders;
create policy "superadmin manages restaurant riders" on restaurant_riders
  for all using (is_superadmin()) with check (is_superadmin());

grant select on platform_rider_payment_settings to authenticated;
grant select, insert, update on platform_rider_payment_settings to authenticated;
grant select, insert, update on restaurant_rider_invites to authenticated;
grant select, insert, update on rider_applications to authenticated;
grant select, insert, update on restaurant_riders to authenticated;
grant select, insert, update on platform_rider_payment_settings to service_role;
grant select, insert, update on restaurant_rider_invites to service_role;
grant select, insert, update on rider_applications to service_role;
grant select, insert, update on restaurant_riders to service_role;
