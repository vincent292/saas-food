-- A multi-commerce order needs one rider for the whole pickup route.  This is
-- deliberately separate from order_delivery_links: child orders keep their
-- own kitchen lifecycle, while the rider accepts one master route.
alter table multisite_orders
  drop constraint if exists multisite_orders_status_check;

alter table multisite_orders
  add constraint multisite_orders_status_check
  check (status in (
    'submitted', 'accepted', 'preparing', 'ready_for_dispatch',
    'rider_searching', 'rider_countered', 'rider_assigned', 'in_delivery',
    'delivered', 'partially_cancelled', 'cancelled'
  ));

create table if not exists multisite_rider_offers (
  id uuid primary key default gen_random_uuid(),
  multisite_order_id uuid not null references multisite_orders(id) on delete cascade,
  restaurant_rider_id uuid not null references restaurant_riders(id) on delete cascade,
  rider_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'countered', 'accepted', 'rejected', 'expired', 'cancelled')),
  offer_round integer not null default 1 check (offer_round > 0),
  offered_fee numeric(12, 2) not null check (offered_fee >= 0),
  counter_fee numeric(12, 2) check (counter_fee is null or counter_fee >= 0),
  distance_km numeric(8, 3),
  score numeric(12, 4) not null default 0,
  expires_at timestamptz not null default (now() + interval '15 seconds'),
  responded_at timestamptz,
  response_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists multisite_rider_offers_order_status_idx
  on multisite_rider_offers (multisite_order_id, status, created_at desc);
create index if not exists multisite_rider_offers_rider_status_idx
  on multisite_rider_offers (restaurant_rider_id, status, created_at desc);
create unique index if not exists multisite_rider_offers_one_live_offer_idx
  on multisite_rider_offers (multisite_order_id)
  where status in ('pending', 'countered');
create unique index if not exists multisite_rider_offers_one_accepted_offer_idx
  on multisite_rider_offers (multisite_order_id)
  where status = 'accepted';

drop trigger if exists multisite_rider_offers_updated_at on multisite_rider_offers;
create trigger multisite_rider_offers_updated_at
  before update on multisite_rider_offers
  for each row execute function set_updated_at();

create table if not exists multisite_delivery_dispatches (
  id uuid primary key default gen_random_uuid(),
  multisite_order_id uuid not null unique references multisite_orders(id) on delete cascade,
  rider_offer_id uuid references multisite_rider_offers(id) on delete set null,
  restaurant_rider_id uuid not null references restaurant_riders(id) on delete restrict,
  rider_user_id uuid references auth.users(id) on delete set null,
  accepted_fee numeric(12, 2) not null check (accepted_fee >= 0),
  status text not null default 'active'
    check (status in ('active', 'arrived', 'delivered', 'cancelled')),
  assigned_at timestamptz not null default now(),
  arrived_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists multisite_delivery_dispatches_rider_status_idx
  on multisite_delivery_dispatches (restaurant_rider_id, status, assigned_at desc);
create index if not exists multisite_delivery_dispatches_user_status_idx
  on multisite_delivery_dispatches (rider_user_id, status, assigned_at desc)
  where rider_user_id is not null;

drop trigger if exists multisite_delivery_dispatches_updated_at on multisite_delivery_dispatches;
create trigger multisite_delivery_dispatches_updated_at
  before update on multisite_delivery_dispatches
  for each row execute function set_updated_at();

alter table multisite_rider_offers enable row level security;
alter table multisite_delivery_dispatches enable row level security;

drop policy if exists "riders read own multisite offers" on multisite_rider_offers;
create policy "riders read own multisite offers" on multisite_rider_offers
  for select using (is_superadmin() or rider_user_id = auth.uid());

drop policy if exists "superadmins manage multisite rider offers" on multisite_rider_offers;
create policy "superadmins manage multisite rider offers" on multisite_rider_offers
  for all using (is_superadmin()) with check (is_superadmin());

drop policy if exists "riders read own multisite dispatches" on multisite_delivery_dispatches;
create policy "riders read own multisite dispatches" on multisite_delivery_dispatches
  for select using (is_superadmin() or rider_user_id = auth.uid());

drop policy if exists "superadmins manage multisite dispatches" on multisite_delivery_dispatches;
create policy "superadmins manage multisite dispatches" on multisite_delivery_dispatches
  for all using (is_superadmin()) with check (is_superadmin());

grant select, insert, update on multisite_rider_offers to authenticated, service_role;
grant select, insert, update on multisite_delivery_dispatches to authenticated, service_role;

-- Child orders may continue reporting kitchen changes after a rider is assigned.
-- Preserve the dispatch state until the delivery itself advances or closes.
create or replace function sync_multisite_order_child_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_master_id uuid;
  v_total integer;
  v_cancelled integer;
  v_delivered integer;
  v_ready integer;
  v_in_progress integer;
  v_current_status text;
  v_next_status text;
begin
  update multisite_order_children
     set status = new.status
   where order_id = new.id
   returning multisite_order_id into v_master_id;

  if v_master_id is null then
    return new;
  end if;

  select count(*),
         count(*) filter (where status = 'cancelled'),
         count(*) filter (where status = 'delivered'),
         count(*) filter (where status = 'ready'),
         count(*) filter (where status in ('accepted', 'preparing'))
    into v_total, v_cancelled, v_delivered, v_ready, v_in_progress
    from multisite_order_children
   where multisite_order_id = v_master_id;

  select status into v_current_status from multisite_orders where id = v_master_id;

  v_next_status := case
    when v_cancelled = v_total then 'cancelled'
    when v_delivered = v_total then 'delivered'
    when v_cancelled > 0 then 'partially_cancelled'
    when v_current_status in ('rider_searching', 'rider_countered', 'rider_assigned', 'in_delivery') then v_current_status
    when v_ready = v_total then 'ready_for_dispatch'
    when v_in_progress > 0 then 'preparing'
    else 'accepted'
  end;

  update multisite_orders set status = v_next_status where id = v_master_id;
  return new;
end;
$$;
