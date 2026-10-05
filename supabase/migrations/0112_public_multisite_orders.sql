-- A public multi-commerce purchase is one customer checkout, but each branch
-- continues to receive a normal order in its own operational queue.
create table if not exists multisite_orders (
  id uuid primary key default gen_random_uuid(),
  public_request_id uuid not null unique,
  tracking_token text not null unique default md5(gen_random_uuid()::text || clock_timestamp()::text),
  customer_name text not null,
  customer_phone text,
  customer_email text,
  customer_address text not null,
  delivery_address_detail text,
  delivery_latitude numeric(10, 7) not null,
  delivery_longitude numeric(10, 7) not null,
  delivery_maps_url text,
  status text not null default 'submitted'
    check (status in ('submitted', 'accepted', 'preparing', 'ready_for_dispatch', 'rider_assigned', 'in_delivery', 'delivered', 'partially_cancelled', 'cancelled')),
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid', 'cancelled', 'refunded')),
  payment_method payment_method_type not null default 'cash',
  subtotal numeric(12, 2) not null default 0 check (subtotal >= 0),
  delivery_fee numeric(12, 2) not null default 0 check (delivery_fee >= 0),
  total numeric(12, 2) not null default 0 check (total >= 0),
  rider_fee_suggested numeric(12, 2) not null default 0 check (rider_fee_suggested >= 0),
  rider_fee_minimum numeric(12, 2) not null default 0 check (rider_fee_minimum >= 0),
  rider_fee_maximum numeric(12, 2) not null default 0 check (rider_fee_maximum >= 0),
  route_plan jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint multisite_checkout_total_check check (total = round(subtotal + delivery_fee, 2)),
  constraint multisite_checkout_rider_range_check check (rider_fee_minimum <= rider_fee_suggested and rider_fee_suggested <= rider_fee_maximum)
);

create table if not exists multisite_order_children (
  id uuid primary key default gen_random_uuid(),
  multisite_order_id uuid not null references multisite_orders(id) on delete cascade,
  restaurant_id uuid not null references restaurants(id) on delete restrict,
  order_id uuid not null unique references orders(id) on delete restrict,
  pickup_position integer not null check (pickup_position between 1 and 5),
  release_delay_minutes integer not null default 0 check (release_delay_minutes >= 0),
  estimated_ready_minutes integer not null default 0 check (estimated_ready_minutes >= 0),
  status order_status not null default 'pending',
  subtotal numeric(12, 2) not null default 0 check (subtotal >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (multisite_order_id, restaurant_id),
  unique (multisite_order_id, pickup_position)
);

create index if not exists multisite_orders_status_created_idx
  on multisite_orders (status, created_at desc);
create index if not exists multisite_order_children_restaurant_status_idx
  on multisite_order_children (restaurant_id, status, created_at desc);
create index if not exists multisite_order_children_master_idx
  on multisite_order_children (multisite_order_id, pickup_position);

drop trigger if exists multisite_orders_updated_at on multisite_orders;
create trigger multisite_orders_updated_at
  before update on multisite_orders
  for each row execute function set_updated_at();

drop trigger if exists multisite_order_children_updated_at on multisite_order_children;
create trigger multisite_order_children_updated_at
  before update on multisite_order_children
  for each row execute function set_updated_at();

alter table multisite_orders enable row level security;
alter table multisite_order_children enable row level security;

drop policy if exists "superadmins manage multisite orders" on multisite_orders;
create policy "superadmins manage multisite orders"
  on multisite_orders for all
  using (is_superadmin()) with check (is_superadmin());

drop policy if exists "members read multisite order children" on multisite_order_children;
create policy "members read multisite order children"
  on multisite_order_children for select
  using (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier','kitchen']::app_role[]));

drop policy if exists "superadmins manage multisite order children" on multisite_order_children;
create policy "superadmins manage multisite order children"
  on multisite_order_children for all
  using (is_superadmin()) with check (is_superadmin());

-- Keeps the public aggregate useful without changing the established per-store
-- order lifecycle or its RLS policies.
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

  v_next_status := case
    when v_cancelled = v_total then 'cancelled'
    when v_delivered = v_total then 'delivered'
    when v_cancelled > 0 then 'partially_cancelled'
    when v_ready = v_total then 'ready_for_dispatch'
    when v_in_progress > 0 then 'preparing'
    else 'accepted'
  end;

  update multisite_orders set status = v_next_status where id = v_master_id;
  return new;
end;
$$;

drop trigger if exists sync_multisite_order_child_status_trigger on orders;
create trigger sync_multisite_order_child_status_trigger
  after update of status on orders
  for each row execute function sync_multisite_order_child_status();

create or replace function create_public_multisite_order_transaction(
  p_request_id uuid,
  p_order jsonb,
  p_children jsonb
)
returns table (id uuid, tracking_token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_token text;
  v_child jsonb;
  v_child_order_id uuid;
  v_restaurant_id uuid;
  v_child_subtotal numeric(12, 2);
  v_items_total numeric(12, 2);
  v_parent_subtotal numeric(12, 2);
  v_delivery_fee numeric(12, 2);
  v_total numeric(12, 2);
  v_position integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service-role-required' using errcode = '42501';
  end if;

  if p_request_id is null or jsonb_typeof(p_order) <> 'object' or jsonb_typeof(p_children) <> 'array' then
    raise exception 'invalid-multisite-order' using errcode = '22023';
  end if;

  if jsonb_array_length(p_children) < 2 or jsonb_array_length(p_children) > 3 then
    raise exception 'invalid-multisite-children' using errcode = '22023';
  end if;

  select id, tracking_token into v_order_id, v_token
    from multisite_orders
   where public_request_id = p_request_id;
  if v_order_id is not null then
    return query select v_order_id, v_token;
    return;
  end if;

  v_parent_subtotal := round(coalesce((p_order->>'subtotal')::numeric, 0), 2);
  v_delivery_fee := round(coalesce((p_order->>'delivery_fee')::numeric, 0), 2);
  v_total := round(coalesce((p_order->>'total')::numeric, 0), 2);
  if v_parent_subtotal < 0 or v_delivery_fee < 0 or v_total <> round(v_parent_subtotal + v_delivery_fee, 2) then
    raise exception 'invalid-multisite-total' using errcode = '22023';
  end if;

  if coalesce(p_order->>'customer_name', '') = ''
     or coalesce(p_order->>'customer_address', '') = ''
     or nullif(p_order->>'delivery_latitude', '') is null
     or nullif(p_order->>'delivery_longitude', '') is null
     or p_order->>'payment_method' <> 'cash' then
    raise exception 'invalid-multisite-customer' using errcode = '22023';
  end if;

  insert into multisite_orders (
    public_request_id, customer_name, customer_phone, customer_email,
    customer_address, delivery_address_detail, delivery_latitude, delivery_longitude, delivery_maps_url,
    payment_method, subtotal, delivery_fee, total,
    rider_fee_suggested, rider_fee_minimum, rider_fee_maximum, route_plan, notes
  ) values (
    p_request_id, p_order->>'customer_name', nullif(p_order->>'customer_phone', ''), nullif(p_order->>'customer_email', ''),
    p_order->>'customer_address', nullif(p_order->>'delivery_address_detail', ''),
    (p_order->>'delivery_latitude')::numeric, (p_order->>'delivery_longitude')::numeric, nullif(p_order->>'delivery_maps_url', ''),
    'cash', v_parent_subtotal, v_delivery_fee, v_total,
    round(coalesce((p_order->>'rider_fee_suggested')::numeric, v_delivery_fee), 2),
    round(coalesce((p_order->>'rider_fee_minimum')::numeric, v_delivery_fee), 2),
    round(coalesce((p_order->>'rider_fee_maximum')::numeric, v_delivery_fee), 2),
    coalesce(p_order->'route_plan', '{}'::jsonb), nullif(p_order->>'notes', '')
  ) returning id, tracking_token into v_order_id, v_token;

  for v_child in select value from jsonb_array_elements(p_children)
  loop
    v_restaurant_id := (v_child->>'restaurant_id')::uuid;
    v_position := (v_child->>'pickup_position')::integer;
    if v_restaurant_id is null or v_position is null or jsonb_typeof(v_child->'items') <> 'array' or jsonb_array_length(v_child->'items') = 0 then
      raise exception 'invalid-multisite-child' using errcode = '22023';
    end if;

    if not exists (
      select 1 from restaurants r
       join restaurant_settings s on s.restaurant_id = r.id
      where r.id = v_restaurant_id and r.status = 'active' and r.deleted_at is null and s.delivery_enabled is true
    ) then
      raise exception 'invalid-multisite-restaurant' using errcode = '22023';
    end if;

    if not exists (select 1 from cash_sessions cs where cs.restaurant_id = v_restaurant_id and cs.status = 'open') then
      raise exception 'no-open-cash' using errcode = 'P0002';
    end if;

    if exists (
      select 1
      from jsonb_to_recordset(v_child->'items') as item(product_id uuid, unit_price numeric, quantity integer, subtotal numeric)
      left join products p on p.id = item.product_id and p.restaurant_id = v_restaurant_id and p.is_available is true
      where p.id is null or item.quantity <= 0 or item.unit_price < 0 or item.subtotal <> round(item.unit_price * item.quantity, 2)
    ) then
      raise exception 'invalid-multisite-items' using errcode = '22023';
    end if;

    select coalesce(sum(item.subtotal), 0) into v_items_total
      from jsonb_to_recordset(v_child->'items') as item(subtotal numeric);
    v_child_subtotal := round(coalesce((v_child->>'subtotal')::numeric, 0), 2);
    if v_child_subtotal <> round(v_items_total, 2) then
      raise exception 'invalid-multisite-items-total' using errcode = '22023';
    end if;

    insert into orders (
      restaurant_id, order_number, public_request_id, customer_name, customer_phone, customer_email,
      customer_address, delivery_address_detail, delivery_latitude, delivery_longitude, delivery_maps_url,
      delivery_distance_km, requested_fulfillment_at, order_type, order_origin, status,
      payment_status, payment_method, subtotal, delivery_fee, discount_total, total, notes
    ) values (
      v_restaurant_id, v_child->>'order_number', p_request_id, p_order->>'customer_name', nullif(p_order->>'customer_phone', ''), nullif(p_order->>'customer_email', ''),
      p_order->>'customer_address', nullif(p_order->>'delivery_address_detail', ''), (p_order->>'delivery_latitude')::numeric,
      (p_order->>'delivery_longitude')::numeric, nullif(p_order->>'delivery_maps_url', ''), nullif(v_child->>'distance_to_destination_km', '')::numeric,
      case when coalesce((v_child->>'release_delay_minutes')::integer, 0) > 0 then now() + make_interval(mins => (v_child->>'release_delay_minutes')::integer) else null end,
      'delivery', 'web_checkout', 'pending', 'pending', 'cash', v_child_subtotal, 0, 0, v_child_subtotal,
      concat('Pedido multi-comercio #', left(v_order_id::text, 8), ' | Retiro ', v_position, ' de ', jsonb_array_length(p_children),
             case when coalesce((v_child->>'release_delay_minutes')::integer, 0) > 0 then concat(' | Preparar para retiro aprox. en ', v_child->>'release_delay_minutes', ' min') else '' end,
             case when nullif(v_child->>'notes', '') is not null then concat(' | ', v_child->>'notes') else '' end)
    ) returning id into v_child_order_id;

    insert into order_items (order_id, product_id, product_name, variant_id, option_ids, unit_price, quantity, subtotal, notes)
    select v_child_order_id, item.product_id, item.product_name, item.variant_id,
      coalesce(array(select jsonb_array_elements_text(coalesce(item.option_ids, '[]'::jsonb))::uuid), '{}'::uuid[]),
      item.unit_price, item.quantity, item.subtotal, nullif(item.notes, '')
    from jsonb_to_recordset(v_child->'items') as item(
      product_id uuid, product_name text, variant_id uuid, option_ids jsonb, unit_price numeric, quantity integer, subtotal numeric, notes text
    );

    insert into multisite_order_children (
      multisite_order_id, restaurant_id, order_id, pickup_position, release_delay_minutes, estimated_ready_minutes, status, subtotal
    ) values (
      v_order_id, v_restaurant_id, v_child_order_id, v_position,
      coalesce((v_child->>'release_delay_minutes')::integer, 0), coalesce((v_child->>'estimated_ready_minutes')::integer, 0), 'pending', v_child_subtotal
    );
  end loop;

  if v_parent_subtotal <> (select coalesce(sum(subtotal), 0) from multisite_order_children where multisite_order_id = v_order_id) then
    raise exception 'invalid-multisite-total' using errcode = '22023';
  end if;

  return query select v_order_id, v_token;
end;
$$;

revoke all on function create_public_multisite_order_transaction(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function create_public_multisite_order_transaction(uuid, jsonb, jsonb) to service_role;
