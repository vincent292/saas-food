create table if not exists inventory_categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, name)
);

drop function if exists register_inventory_movement_atomic(uuid, uuid, inventory_movement_type, numeric, text);

create table if not exists inventory_zones (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, name)
);

create table if not exists inventory_item_zones (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  inventory_item_id uuid not null references inventory_items(id) on delete cascade,
  zone_id uuid not null references inventory_zones(id) on delete cascade,
  stock numeric(12,3) not null default 0,
  updated_at timestamptz not null default now(),
  unique (inventory_item_id, zone_id)
);

create table if not exists product_suppliers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  supplier_id uuid not null references inventory_suppliers(id) on delete cascade,
  notes text,
  created_at timestamptz not null default now(),
  unique (product_id, supplier_id)
);

alter table inventory_items
  add column if not exists category_id uuid references inventory_categories(id) on delete set null;

alter table inventory_movements
  add column if not exists from_zone_id uuid references inventory_zones(id) on delete set null,
  add column if not exists to_zone_id uuid references inventory_zones(id) on delete set null,
  add column if not exists supplier_id uuid references inventory_suppliers(id) on delete set null,
  add column if not exists order_id uuid references orders(id) on delete set null,
  add column if not exists related_movement_id uuid references inventory_movements(id) on delete set null;

create unique index if not exists idx_inventory_sale_usage_once_per_order_item
  on inventory_movements(order_id, inventory_item_id, type)
  where order_id is not null and type = 'sale_usage';

create unique index if not exists idx_inventory_reversal_once_per_order_item
  on inventory_movements(order_id, inventory_item_id, related_movement_id)
  where order_id is not null and related_movement_id is not null;

drop trigger if exists inventory_categories_updated_at on inventory_categories;
create trigger inventory_categories_updated_at before update on inventory_categories for each row execute function set_updated_at();
drop trigger if exists inventory_zones_updated_at on inventory_zones;
create trigger inventory_zones_updated_at before update on inventory_zones for each row execute function set_updated_at();
drop trigger if exists inventory_item_zones_updated_at on inventory_item_zones;
create trigger inventory_item_zones_updated_at before update on inventory_item_zones for each row execute function set_updated_at();

alter table inventory_categories enable row level security;
alter table inventory_zones enable row level security;
alter table inventory_item_zones enable row level security;
alter table product_suppliers enable row level security;

drop policy if exists "members read inventory categories" on inventory_categories;
create policy "members read inventory categories" on inventory_categories for select using (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier','kitchen']::app_role[]));
drop policy if exists "admins manage inventory categories" on inventory_categories;
create policy "admins manage inventory categories" on inventory_categories for all using (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[])) with check (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[]));

drop policy if exists "members read inventory zones" on inventory_zones;
create policy "members read inventory zones" on inventory_zones for select using (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier','kitchen']::app_role[]));
drop policy if exists "admins manage inventory zones" on inventory_zones;
create policy "admins manage inventory zones" on inventory_zones for all using (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[])) with check (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[]));

drop policy if exists "members read inventory item zones" on inventory_item_zones;
create policy "members read inventory item zones" on inventory_item_zones for select using (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier','kitchen']::app_role[]));
drop policy if exists "admins manage inventory item zones" on inventory_item_zones;
create policy "admins manage inventory item zones" on inventory_item_zones for all using (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier']::app_role[])) with check (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier']::app_role[]));

drop policy if exists "members read product suppliers" on product_suppliers;
create policy "members read product suppliers" on product_suppliers for select using (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier','kitchen']::app_role[]));
drop policy if exists "admins manage product suppliers" on product_suppliers;
create policy "admins manage product suppliers" on product_suppliers for all using (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[])) with check (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[]));

create or replace function create_default_inventory_zone(p_restaurant_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_zone_id uuid;
begin
  insert into inventory_zones (restaurant_id, name, description)
  values (p_restaurant_id, 'Principal', 'Zona principal de inventario')
  on conflict (restaurant_id, name) do update set is_active = true
  returning id into v_zone_id;

  return v_zone_id;
end;
$$;

create or replace function register_inventory_movement_atomic(
  p_restaurant_id uuid,
  p_inventory_item_id uuid,
  p_type inventory_movement_type,
  p_quantity numeric,
  p_reason text,
  p_from_zone_id uuid default null,
  p_to_zone_id uuid default null,
  p_supplier_id uuid default null
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

create or replace function transfer_inventory_zone_atomic(
  p_restaurant_id uuid,
  p_inventory_item_id uuid,
  p_from_zone_id uuid,
  p_to_zone_id uuid,
  p_quantity numeric,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item inventory_items%rowtype;
  v_from_stock numeric;
  v_movement_id uuid;
begin
  if auth.uid() is null or not (is_superadmin() or has_restaurant_role(p_restaurant_id, array['restaurant_admin','cashier']::app_role[])) then
    raise exception 'inventory access denied' using errcode = '42501';
  end if;

  if p_from_zone_id = p_to_zone_id then
    raise exception 'same-zone' using errcode = '22023';
  end if;

  if p_quantity <= 0 then
    raise exception 'quantity must be positive' using errcode = '22003';
  end if;

  select * into v_item
  from inventory_items
  where restaurant_id = p_restaurant_id and id = p_inventory_item_id
  for update;

  if not found then
    raise exception 'item-not-found' using errcode = 'P0002';
  end if;

  select stock into v_from_stock
  from inventory_item_zones
  where inventory_item_id = p_inventory_item_id and zone_id = p_from_zone_id
  for update;

  if not found or v_from_stock < p_quantity then
    raise exception 'negative-zone-stock' using errcode = '22003';
  end if;

  update inventory_item_zones
    set stock = stock - p_quantity
    where inventory_item_id = p_inventory_item_id and zone_id = p_from_zone_id;

  insert into inventory_item_zones (restaurant_id, inventory_item_id, zone_id, stock)
  values (p_restaurant_id, p_inventory_item_id, p_to_zone_id, p_quantity)
  on conflict (inventory_item_id, zone_id)
  do update set stock = inventory_item_zones.stock + excluded.stock;

  insert into inventory_movements (restaurant_id, inventory_item_id, type, quantity, previous_stock, new_stock, reason, created_by, from_zone_id, to_zone_id)
  values (p_restaurant_id, p_inventory_item_id, 'adjustment', p_quantity, v_item.current_stock, v_item.current_stock, p_reason, auth.uid(), p_from_zone_id, p_to_zone_id)
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
  v_previous numeric;
  v_new numeric;
  v_zone_id uuid;
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

    select current_stock into v_previous
    from inventory_items
    where id = v_usage.inventory_item_id
    for update;

    v_new := v_previous - v_usage.total_quantity;
    if v_new < 0 then
      raise exception 'negative-stock: %', v_usage.name using errcode = '22003';
    end if;

    update inventory_items set current_stock = v_new where id = v_usage.inventory_item_id;
    update inventory_item_zones
      set stock = stock - v_usage.total_quantity
      where inventory_item_id = v_usage.inventory_item_id
        and zone_id = v_zone_id
        and stock >= v_usage.total_quantity;

    insert into inventory_movements (restaurant_id, inventory_item_id, type, quantity, previous_stock, new_stock, reason, created_by, order_id, from_zone_id)
    values (v_order.restaurant_id, v_usage.inventory_item_id, 'sale_usage', v_usage.total_quantity, v_previous, v_new, 'Uso por venta ' || v_order.order_number, auth.uid(), p_order_id, v_zone_id);
  end loop;
end;
$$;

create or replace function reverse_order_inventory_usage(p_order_id uuid, p_reason text default 'Reversión por cancelación')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_movement record;
  v_previous numeric;
  v_new numeric;
  v_zone_id uuid;
begin
  for v_movement in
    select *
    from inventory_movements
    where order_id = p_order_id
      and type = 'sale_usage'
  loop
    if exists (
      select 1 from inventory_movements
      where related_movement_id = v_movement.id
    ) then
      continue;
    end if;

    v_zone_id := coalesce(v_movement.from_zone_id, create_default_inventory_zone(v_movement.restaurant_id));

    select current_stock into v_previous
    from inventory_items
    where id = v_movement.inventory_item_id
    for update;

    v_new := v_previous + v_movement.quantity;

    update inventory_items set current_stock = v_new where id = v_movement.inventory_item_id;
    insert into inventory_item_zones (restaurant_id, inventory_item_id, zone_id, stock)
    values (v_movement.restaurant_id, v_movement.inventory_item_id, v_zone_id, v_movement.quantity)
    on conflict (inventory_item_id, zone_id)
    do update set stock = inventory_item_zones.stock + excluded.stock;

    insert into inventory_movements (restaurant_id, inventory_item_id, type, quantity, previous_stock, new_stock, reason, created_by, order_id, to_zone_id, related_movement_id)
    values (v_movement.restaurant_id, v_movement.inventory_item_id, 'in', v_movement.quantity, v_previous, v_new, p_reason, auth.uid(), p_order_id, v_zone_id, v_movement.id);
  end loop;
end;
$$;

grant execute on function create_default_inventory_zone(uuid) to authenticated;
grant execute on function register_inventory_movement_atomic(uuid, uuid, inventory_movement_type, numeric, text, uuid, uuid, uuid) to authenticated;
grant execute on function transfer_inventory_zone_atomic(uuid, uuid, uuid, uuid, numeric, text) to authenticated;
grant execute on function reverse_order_inventory_usage(uuid, text) to authenticated;
