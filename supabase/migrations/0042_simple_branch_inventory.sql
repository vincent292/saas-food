alter table inventory_items
  add column if not exists item_kind text not null default 'ingredient'
    check (item_kind in ('finished', 'ingredient', 'supply'));

create table if not exists inventory_lots (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  inventory_item_id uuid not null references inventory_items(id) on delete cascade,
  supplier_id uuid references inventory_suppliers(id) on delete set null,
  lot_code text,
  expires_on date,
  initial_quantity numeric(12,3) not null default 0,
  remaining_quantity numeric(12,3) not null default 0,
  notes text,
  received_at timestamptz not null default now(),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (initial_quantity >= 0),
  check (remaining_quantity >= 0)
);

create index if not exists idx_inventory_lots_item_expiry
  on inventory_lots(restaurant_id, inventory_item_id, expires_on, received_at)
  where is_active = true and remaining_quantity > 0;

create table if not exists inventory_branch_transfers (
  id uuid primary key default gen_random_uuid(),
  from_restaurant_id uuid not null references restaurants(id) on delete cascade,
  to_restaurant_id uuid not null references restaurants(id) on delete cascade,
  from_inventory_item_id uuid not null references inventory_items(id) on delete cascade,
  to_inventory_item_id uuid not null references inventory_items(id) on delete cascade,
  quantity numeric(12,3) not null check (quantity > 0),
  reason text not null,
  status text not null default 'completed' check (status in ('completed', 'cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_inventory_branch_transfers_from
  on inventory_branch_transfers(from_restaurant_id, created_at desc);

create index if not exists idx_inventory_branch_transfers_to
  on inventory_branch_transfers(to_restaurant_id, created_at desc);

drop trigger if exists inventory_lots_updated_at on inventory_lots;
create trigger inventory_lots_updated_at before update on inventory_lots for each row execute function set_updated_at();

alter table inventory_lots enable row level security;
alter table inventory_branch_transfers enable row level security;

drop policy if exists "members read inventory lots" on inventory_lots;
create policy "members read inventory lots" on inventory_lots
for select using (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier','kitchen']::app_role[]));

drop policy if exists "admins manage inventory lots" on inventory_lots;
create policy "admins manage inventory lots" on inventory_lots
for all using (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier']::app_role[]))
with check (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier']::app_role[]));

drop policy if exists "members read branch transfers" on inventory_branch_transfers;
create policy "members read branch transfers" on inventory_branch_transfers
for select using (
  is_superadmin()
  or has_restaurant_role(from_restaurant_id, array['restaurant_admin','cashier']::app_role[])
  or has_restaurant_role(to_restaurant_id, array['restaurant_admin','cashier']::app_role[])
);

drop policy if exists "admins manage branch transfers" on inventory_branch_transfers;
create policy "admins manage branch transfers" on inventory_branch_transfers
for all using (
  is_superadmin()
  or has_restaurant_role(from_restaurant_id, array['restaurant_admin','cashier']::app_role[])
)
with check (
  is_superadmin()
  or has_restaurant_role(from_restaurant_id, array['restaurant_admin','cashier']::app_role[])
);

drop function if exists consume_inventory_lots(uuid, uuid, numeric);

create or replace function consume_inventory_lots(
  p_restaurant_id uuid,
  p_inventory_item_id uuid,
  p_quantity numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining numeric := p_quantity;
  v_lot record;
  v_take numeric;
begin
  if p_quantity <= 0 then
    return;
  end if;

  for v_lot in
    select id, remaining_quantity
    from inventory_lots
    where restaurant_id = p_restaurant_id
      and inventory_item_id = p_inventory_item_id
      and is_active = true
      and remaining_quantity > 0
    order by expires_on nulls last, received_at, created_at
    for update
  loop
    exit when v_remaining <= 0;
    v_take := least(v_lot.remaining_quantity, v_remaining);

    update inventory_lots
      set remaining_quantity = remaining_quantity - v_take,
          is_active = remaining_quantity - v_take > 0
      where id = v_lot.id;

    v_remaining := v_remaining - v_take;
  end loop;
end;
$$;

drop function if exists register_inventory_movement_atomic(uuid, uuid, inventory_movement_type, numeric, text, uuid, uuid, uuid);

create or replace function register_inventory_movement_atomic(
  p_restaurant_id uuid,
  p_inventory_item_id uuid,
  p_type inventory_movement_type,
  p_quantity numeric,
  p_reason text,
  p_from_zone_id uuid default null,
  p_to_zone_id uuid default null,
  p_supplier_id uuid default null,
  p_lot_code text default null,
  p_expires_on date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item inventory_items%rowtype;
  v_new_stock numeric;
  v_movement_id uuid;
  v_zone_id uuid;
  v_from_stock numeric;
begin
  if auth.uid() is null or not (is_superadmin() or has_restaurant_role(p_restaurant_id, array['restaurant_admin','cashier']::app_role[])) then
    raise exception 'inventory access denied' using errcode = '42501';
  end if;

  if p_quantity < 0 then
    raise exception 'quantity cannot be negative' using errcode = '22003';
  end if;

  select * into v_item
  from inventory_items
  where restaurant_id = p_restaurant_id and id = p_inventory_item_id
  for update;

  if not found then
    raise exception 'item-not-found' using errcode = 'P0002';
  end if;

  if p_type = 'adjustment' then
    v_new_stock := p_quantity;
  elsif p_type = 'in' then
    v_new_stock := v_item.current_stock + p_quantity;
  else
    v_new_stock := v_item.current_stock - p_quantity;
  end if;

  if v_new_stock < 0 then
    raise exception 'negative-stock' using errcode = '22003';
  end if;

  update inventory_items set current_stock = v_new_stock where id = v_item.id;

  v_zone_id := coalesce(p_to_zone_id, p_from_zone_id);
  if v_zone_id is null then
    v_zone_id := create_default_inventory_zone(p_restaurant_id);
  end if;

  if p_type = 'in' then
    insert into inventory_item_zones (restaurant_id, inventory_item_id, zone_id, stock)
    values (p_restaurant_id, v_item.id, v_zone_id, p_quantity)
    on conflict (inventory_item_id, zone_id)
    do update set stock = inventory_item_zones.stock + excluded.stock;

    if p_quantity > 0 and (nullif(p_lot_code, '') is not null or p_expires_on is not null) then
      insert into inventory_lots (restaurant_id, inventory_item_id, supplier_id, lot_code, expires_on, initial_quantity, remaining_quantity, notes)
      values (p_restaurant_id, v_item.id, p_supplier_id, nullif(p_lot_code, ''), p_expires_on, p_quantity, p_quantity, p_reason);
    end if;
  elsif p_type in ('out', 'waste', 'sale_usage') then
    select stock into v_from_stock
    from inventory_item_zones
    where inventory_item_id = v_item.id and zone_id = v_zone_id
    for update;

    if found then
      if v_from_stock < p_quantity then
        raise exception 'negative-zone-stock' using errcode = '22003';
      end if;
      update inventory_item_zones set stock = v_from_stock - p_quantity where inventory_item_id = v_item.id and zone_id = v_zone_id;
    end if;

    perform consume_inventory_lots(p_restaurant_id, v_item.id, p_quantity);
  elsif p_type = 'adjustment' then
    insert into inventory_item_zones (restaurant_id, inventory_item_id, zone_id, stock)
    values (p_restaurant_id, v_item.id, v_zone_id, p_quantity)
    on conflict (inventory_item_id, zone_id)
    do update set stock = excluded.stock;
  end if;

  insert into inventory_movements (restaurant_id, inventory_item_id, type, quantity, previous_stock, new_stock, reason, created_by, from_zone_id, to_zone_id, supplier_id)
  values (p_restaurant_id, v_item.id, p_type, p_quantity, v_item.current_stock, v_new_stock, p_reason, auth.uid(), p_from_zone_id, p_to_zone_id, p_supplier_id)
  returning id into v_movement_id;

  return v_movement_id;
end;
$$;

create or replace function apply_order_inventory_usage(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order orders%rowtype;
  v_usage record;
  v_zone_id uuid;
  v_movement_id uuid;
begin
  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception 'order-not-found' using errcode = 'P0002';
  end if;

  v_zone_id := create_default_inventory_zone(v_order.restaurant_id);

  for v_usage in
    select
      pi.inventory_item_id,
      ii.name,
      sum(oi.quantity * pi.quantity * (1 + (pi.waste_factor / 100)))::numeric(12,3) as total_quantity
    from order_items oi
    join product_ingredients pi on pi.product_id = oi.product_id
    join inventory_items ii on ii.id = pi.inventory_item_id
    where oi.order_id = p_order_id
      and pi.restaurant_id = v_order.restaurant_id
      and ii.is_active = true
    group by pi.inventory_item_id, ii.name
  loop
    if exists (
      select 1 from inventory_movements
      where order_id = p_order_id
        and inventory_item_id = v_usage.inventory_item_id
        and type = 'sale_usage'
    ) then
      continue;
    end if;

    v_movement_id := register_inventory_movement_atomic(
      v_order.restaurant_id,
      v_usage.inventory_item_id,
      'sale_usage',
      v_usage.total_quantity,
      'Uso por venta ' || v_order.order_number,
      v_zone_id,
      null,
      null,
      null,
      null
    );

    update inventory_movements
      set order_id = p_order_id
      where id = v_movement_id;
  end loop;
end;
$$;

create or replace function apply_order_inventory_usage_from_cash_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.type = 'sale' and new.order_id is not null then
    perform apply_order_inventory_usage(new.order_id);
  end if;
  return new;
end;
$$;

drop trigger if exists cash_sale_applies_inventory_usage on cash_movements;
create trigger cash_sale_applies_inventory_usage
after insert on cash_movements
for each row execute function apply_order_inventory_usage_from_cash_movement();

create or replace function transfer_inventory_branch_atomic(
  p_from_restaurant_id uuid,
  p_to_restaurant_id uuid,
  p_from_inventory_item_id uuid,
  p_to_inventory_item_id uuid,
  p_quantity numeric,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from_restaurant restaurants%rowtype;
  v_to_restaurant restaurants%rowtype;
  v_to_item inventory_items%rowtype;
  v_to_previous numeric;
  v_to_new numeric;
  v_to_zone_id uuid;
  v_transfer_id uuid;
begin
  if p_from_restaurant_id = p_to_restaurant_id then
    raise exception 'same-branch' using errcode = '22023';
  end if;

  if p_quantity <= 0 then
    raise exception 'quantity must be positive' using errcode = '22003';
  end if;

  if auth.uid() is null or not (is_superadmin() or has_restaurant_role(p_from_restaurant_id, array['restaurant_admin','cashier']::app_role[])) then
    raise exception 'inventory access denied' using errcode = '42501';
  end if;

  select * into v_from_restaurant from restaurants where id = p_from_restaurant_id;
  select * into v_to_restaurant from restaurants where id = p_to_restaurant_id;

  if not found or v_from_restaurant.id is null or v_to_restaurant.id is null then
    raise exception 'branch-not-found' using errcode = 'P0002';
  end if;

  if not is_superadmin() then
    if coalesce(v_from_restaurant.city, '') <> coalesce(v_to_restaurant.city, '')
      or coalesce(v_from_restaurant.owner_user_id::text, v_from_restaurant.owner_email, '') = ''
      or coalesce(v_from_restaurant.owner_user_id::text, v_from_restaurant.owner_email, '') <> coalesce(v_to_restaurant.owner_user_id::text, v_to_restaurant.owner_email, '') then
      raise exception 'branch-transfer-denied' using errcode = '42501';
    end if;
  end if;

  perform register_inventory_movement_atomic(
    p_from_restaurant_id,
    p_from_inventory_item_id,
    'out',
    p_quantity,
    'Transferencia a ' || v_to_restaurant.name || ': ' || p_reason,
    null,
    null,
    null,
    null,
    null
  );

  select * into v_to_item
  from inventory_items
  where restaurant_id = p_to_restaurant_id
    and id = p_to_inventory_item_id
    and is_active = true
  for update;

  if not found then
    raise exception 'target-item-not-found' using errcode = 'P0002';
  end if;

  v_to_previous := v_to_item.current_stock;
  v_to_new := v_to_previous + p_quantity;
  v_to_zone_id := create_default_inventory_zone(p_to_restaurant_id);

  update inventory_items
    set current_stock = v_to_new
    where id = p_to_inventory_item_id;

  insert into inventory_item_zones (restaurant_id, inventory_item_id, zone_id, stock)
  values (p_to_restaurant_id, p_to_inventory_item_id, v_to_zone_id, p_quantity)
  on conflict (inventory_item_id, zone_id)
  do update set stock = inventory_item_zones.stock + excluded.stock;

  insert into inventory_movements (restaurant_id, inventory_item_id, type, quantity, previous_stock, new_stock, reason, created_by, to_zone_id)
  values (p_to_restaurant_id, p_to_inventory_item_id, 'in', p_quantity, v_to_previous, v_to_new, 'Transferencia desde ' || v_from_restaurant.name || ': ' || p_reason, auth.uid(), v_to_zone_id);

  insert into inventory_branch_transfers (
    from_restaurant_id,
    to_restaurant_id,
    from_inventory_item_id,
    to_inventory_item_id,
    quantity,
    reason,
    created_by
  )
  values (
    p_from_restaurant_id,
    p_to_restaurant_id,
    p_from_inventory_item_id,
    p_to_inventory_item_id,
    p_quantity,
    p_reason,
    auth.uid()
  )
  returning id into v_transfer_id;

  return v_transfer_id;
end;
$$;

grant select, insert, update on inventory_lots to authenticated;
grant select, insert on inventory_branch_transfers to authenticated;
grant execute on function consume_inventory_lots(uuid, uuid, numeric) to authenticated;
grant execute on function register_inventory_movement_atomic(uuid, uuid, inventory_movement_type, numeric, text, uuid, uuid, uuid, text, date) to authenticated;
grant execute on function apply_order_inventory_usage_from_cash_movement() to authenticated;
grant execute on function transfer_inventory_branch_atomic(uuid, uuid, uuid, uuid, numeric, text) to authenticated;
