alter table order_delivery_links
  add column if not exists dispatch_source text not null default 'manual_qr'
    check (dispatch_source in ('manual_qr', 'rider_auto', 'rider_manual')),
  add column if not exists rider_offer_id uuid,
  add column if not exists assigned_at timestamptz;

create table if not exists rider_availability (
  restaurant_rider_id uuid primary key references restaurant_riders(id) on delete cascade,
  rider_user_id uuid not null references auth.users(id) on delete cascade,
  is_available boolean not null default false,
  available_date date not null default current_date,
  latitude numeric(10,7),
  longitude numeric(10,7),
  accuracy_m numeric(8,2),
  heading numeric(6,2),
  speed_mps numeric(8,2),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rider_availability_latitude_check check (latitude is null or latitude between -90 and 90),
  constraint rider_availability_longitude_check check (longitude is null or longitude between -180 and 180)
);

create index if not exists idx_rider_availability_available
  on rider_availability (available_date, is_available, last_seen_at desc)
  where is_available = true;

create index if not exists idx_rider_availability_user
  on rider_availability (rider_user_id, available_date);

drop trigger if exists rider_availability_updated_at on rider_availability;
create trigger rider_availability_updated_at
  before update on rider_availability
  for each row execute function set_updated_at();

create table if not exists rider_push_tokens (
  id uuid primary key default gen_random_uuid(),
  rider_user_id uuid not null references auth.users(id) on delete cascade,
  restaurant_rider_id uuid references restaurant_riders(id) on delete cascade,
  expo_push_token text not null unique,
  device_id text,
  platform text,
  app_version text,
  is_enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_rider_push_tokens_user
  on rider_push_tokens (rider_user_id, is_enabled, last_seen_at desc);

create index if not exists idx_rider_push_tokens_rider
  on rider_push_tokens (restaurant_rider_id, is_enabled, last_seen_at desc)
  where restaurant_rider_id is not null;

drop trigger if exists rider_push_tokens_updated_at on rider_push_tokens;
create trigger rider_push_tokens_updated_at
  before update on rider_push_tokens
  for each row execute function set_updated_at();

create table if not exists rider_delivery_offers (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  restaurant_rider_id uuid not null references restaurant_riders(id) on delete cascade,
  rider_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'expired', 'cancelled')),
  offer_round integer not null default 1,
  distance_km numeric(8,3),
  active_dispatches integer not null default 0,
  recent_deliveries integer not null default 0,
  acceptance_rate numeric(5,4),
  score numeric(12,4) not null default 0,
  random_weight numeric(8,6) not null default random(),
  expires_at timestamptz not null default (now() + interval '45 seconds'),
  responded_at timestamptz,
  response_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_rider_delivery_offers_order
  on rider_delivery_offers (order_id, status, created_at desc);

create index if not exists idx_rider_delivery_offers_rider
  on rider_delivery_offers (restaurant_rider_id, status, created_at desc);

create unique index if not exists idx_rider_delivery_offers_one_pending_per_order
  on rider_delivery_offers (order_id)
  where status = 'pending';

create unique index if not exists idx_rider_delivery_offers_one_accepted_per_order
  on rider_delivery_offers (order_id)
  where status = 'accepted';

drop trigger if exists rider_delivery_offers_updated_at on rider_delivery_offers;
create trigger rider_delivery_offers_updated_at
  before update on rider_delivery_offers
  for each row execute function set_updated_at();

alter table order_delivery_links
  drop constraint if exists order_delivery_links_rider_offer_id_fkey,
  add constraint order_delivery_links_rider_offer_id_fkey
    foreign key (rider_offer_id) references rider_delivery_offers(id) on delete set null;

alter table rider_availability enable row level security;
alter table rider_push_tokens enable row level security;
alter table rider_delivery_offers enable row level security;

drop policy if exists "riders read own availability" on rider_availability;
create policy "riders read own availability" on rider_availability
  for select using (
    is_superadmin()
    or rider_user_id = auth.uid()
    or exists (
      select 1 from restaurant_riders rr
      where rr.id = rider_availability.restaurant_rider_id
        and has_restaurant_role(rr.restaurant_id, array['restaurant_admin','cashier']::app_role[])
    )
  );

drop policy if exists "riders manage own availability" on rider_availability;
create policy "riders manage own availability" on rider_availability
  for all using (is_superadmin() or rider_user_id = auth.uid())
  with check (is_superadmin() or rider_user_id = auth.uid());

drop policy if exists "riders manage own push tokens" on rider_push_tokens;
create policy "riders manage own push tokens" on rider_push_tokens
  for all using (is_superadmin() or rider_user_id = auth.uid())
  with check (is_superadmin() or rider_user_id = auth.uid());

drop policy if exists "members read rider delivery offers" on rider_delivery_offers;
create policy "members read rider delivery offers" on rider_delivery_offers
  for select using (
    is_superadmin()
    or rider_user_id = auth.uid()
    or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier']::app_role[])
  );

drop policy if exists "service manages rider delivery offers" on rider_delivery_offers;
create policy "service manages rider delivery offers" on rider_delivery_offers
  for all using (is_superadmin()) with check (is_superadmin());

grant select, insert, update on rider_availability to authenticated, service_role;
grant select, insert, update on rider_push_tokens to authenticated, service_role;
grant select, insert, update on rider_delivery_offers to authenticated, service_role;
