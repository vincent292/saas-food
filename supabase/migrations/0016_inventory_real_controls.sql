alter table inventory_items
  add column if not exists sku text,
  add column if not exists category text,
  add column if not exists purchase_unit text,
  add column if not exists purchase_to_stock_factor numeric(12,4) not null default 1,
  add column if not exists supplier_id uuid;

create table if not exists inventory_suppliers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  phone text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table inventory_items
  add constraint inventory_items_supplier_id_fkey
  foreign key (supplier_id) references inventory_suppliers(id) on delete set null;

create table if not exists product_ingredients (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  inventory_item_id uuid not null references inventory_items(id) on delete cascade,
  quantity numeric(12,3) not null check (quantity > 0),
  waste_factor numeric(5,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, inventory_item_id)
);

create table if not exists inventory_counts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'closed')),
  opened_by uuid references auth.users(id),
  closed_by uuid references auth.users(id),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  notes text
);

create unique index if not exists idx_inventory_counts_one_open_per_restaurant
  on inventory_counts(restaurant_id)
  where status = 'open';

create table if not exists inventory_count_lines (
  id uuid primary key default gen_random_uuid(),
  inventory_count_id uuid not null references inventory_counts(id) on delete cascade,
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  inventory_item_id uuid not null references inventory_items(id) on delete cascade,
  expected_stock numeric(12,3) not null,
  counted_stock numeric(12,3) not null,
  difference_stock numeric(12,3) not null,
  notes text,
  created_at timestamptz not null default now(),
  unique (inventory_count_id, inventory_item_id)
);

drop trigger if exists inventory_suppliers_updated_at on inventory_suppliers;
create trigger inventory_suppliers_updated_at before update on inventory_suppliers for each row execute function set_updated_at();
drop trigger if exists product_ingredients_updated_at on product_ingredients;
create trigger product_ingredients_updated_at before update on product_ingredients for each row execute function set_updated_at();

alter table inventory_suppliers enable row level security;
alter table product_ingredients enable row level security;
alter table inventory_counts enable row level security;
alter table inventory_count_lines enable row level security;

drop policy if exists "members read inventory suppliers" on inventory_suppliers;
create policy "members read inventory suppliers" on inventory_suppliers for select using (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier']::app_role[]));
drop policy if exists "admins manage inventory suppliers" on inventory_suppliers;
create policy "admins manage inventory suppliers" on inventory_suppliers for all using (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[])) with check (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[]));

drop policy if exists "members read product ingredients" on product_ingredients;
create policy "members read product ingredients" on product_ingredients for select using (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier','kitchen']::app_role[]));
drop policy if exists "admins manage product ingredients" on product_ingredients;
create policy "admins manage product ingredients" on product_ingredients for all using (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[])) with check (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[]));

drop policy if exists "members read inventory counts" on inventory_counts;
create policy "members read inventory counts" on inventory_counts for select using (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier']::app_role[]));
drop policy if exists "admins manage inventory counts" on inventory_counts;
create policy "admins manage inventory counts" on inventory_counts for all using (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier']::app_role[])) with check (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier']::app_role[]));

drop policy if exists "members read inventory count lines" on inventory_count_lines;
create policy "members read inventory count lines" on inventory_count_lines for select using (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier']::app_role[]));
drop policy if exists "admins manage inventory count lines" on inventory_count_lines;
create policy "admins manage inventory count lines" on inventory_count_lines for all using (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier']::app_role[])) with check (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier']::app_role[]));

create or replace function register_inventory_movement_atomic(
  p_restaurant_id uuid,
  p_inventory_item_id uuid,
  p_type inventory_movement_type,
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
  v_new_stock numeric;
  v_movement_id uuid;
begin
  if auth.uid() is null or not (is_superadmin() or has_restaurant_role(p_restaurant_id, array['restaurant_admin','cashier']::app_role[])) then
    raise exception 'inventory access denied' using errcode = '42501';
  end if;

  if p_quantity < 0 then
    raise exception 'quantity cannot be negative' using errcode = '22003';
  end if;

  select *
    into v_item
    from inventory_items
    where restaurant_id = p_restaurant_id
      and id = p_inventory_item_id
    for update;

  if not found then
    raise exception 'item-not-found' using errcode = 'P0002';
  end if;

  v_new_stock :=
    case
      when p_type = 'in' then v_item.current_stock + p_quantity
      when p_type = 'adjustment' then p_quantity
      else v_item.current_stock - p_quantity
    end;

  if v_new_stock < 0 then
    raise exception 'negative-stock' using errcode = '22003';
  end if;

  update inventory_items
    set current_stock = v_new_stock
    where id = v_item.id;

  insert into inventory_movements (restaurant_id, inventory_item_id, type, quantity, previous_stock, new_stock, reason, created_by)
  values (p_restaurant_id, v_item.id, p_type, p_quantity, v_item.current_stock, v_new_stock, p_reason, auth.uid())
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
begin
  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception 'order-not-found' using errcode = 'P0002';
  end if;

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
    select current_stock into v_previous
    from inventory_items
    where id = v_usage.inventory_item_id
    for update;

    v_new := v_previous - v_usage.total_quantity;
    if v_new < 0 then
      raise exception 'negative-stock: %', v_usage.name using errcode = '22003';
    end if;

    update inventory_items
      set current_stock = v_new
      where id = v_usage.inventory_item_id;

    insert into inventory_movements (restaurant_id, inventory_item_id, type, quantity, previous_stock, new_stock, reason, created_by)
    values (v_order.restaurant_id, v_usage.inventory_item_id, 'sale_usage', v_usage.total_quantity, v_previous, v_new, 'Uso por venta ' || v_order.order_number, auth.uid());
  end loop;
end;
$$;

create or replace function open_inventory_count_atomic(
  p_restaurant_id uuid,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count_id uuid;
begin
  if auth.uid() is null or not (is_superadmin() or has_restaurant_role(p_restaurant_id, array['restaurant_admin','cashier']::app_role[])) then
    raise exception 'inventory access denied' using errcode = '42501';
  end if;

  insert into inventory_counts (restaurant_id, opened_by, notes)
  values (p_restaurant_id, auth.uid(), p_notes)
  returning id into v_count_id;

  return v_count_id;
exception
  when unique_violation then
    raise exception 'count-open' using errcode = '23505';
end;
$$;

create or replace function record_inventory_count_line_atomic(
  p_restaurant_id uuid,
  p_inventory_item_id uuid,
  p_counted_stock numeric,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count_id uuid;
  v_expected numeric;
  v_line_id uuid;
begin
  if auth.uid() is null or not (is_superadmin() or has_restaurant_role(p_restaurant_id, array['restaurant_admin','cashier']::app_role[])) then
    raise exception 'inventory access denied' using errcode = '42501';
  end if;

  if p_counted_stock < 0 then
    raise exception 'counted stock cannot be negative' using errcode = '22003';
  end if;

  select id into v_count_id
  from inventory_counts
  where restaurant_id = p_restaurant_id and status = 'open'
  order by opened_at desc
  limit 1;

  if not found then
    raise exception 'no-open-count' using errcode = 'P0002';
  end if;

  select current_stock into v_expected
  from inventory_items
  where restaurant_id = p_restaurant_id and id = p_inventory_item_id;

  if not found then
    raise exception 'item-not-found' using errcode = 'P0002';
  end if;

  insert into inventory_count_lines (inventory_count_id, restaurant_id, inventory_item_id, expected_stock, counted_stock, difference_stock, notes)
  values (v_count_id, p_restaurant_id, p_inventory_item_id, v_expected, p_counted_stock, p_counted_stock - v_expected, p_notes)
  on conflict (inventory_count_id, inventory_item_id)
  do update set
    expected_stock = excluded.expected_stock,
    counted_stock = excluded.counted_stock,
    difference_stock = excluded.difference_stock,
    notes = excluded.notes
  returning id into v_line_id;

  return v_line_id;
end;
$$;

create or replace function close_inventory_count_atomic(
  p_restaurant_id uuid,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count_id uuid;
  v_line record;
begin
  if auth.uid() is null or not (is_superadmin() or has_restaurant_role(p_restaurant_id, array['restaurant_admin','cashier']::app_role[])) then
    raise exception 'inventory access denied' using errcode = '42501';
  end if;

  select id into v_count_id
  from inventory_counts
  where restaurant_id = p_restaurant_id and status = 'open'
  order by opened_at desc
  limit 1
  for update;

  if not found then
    raise exception 'no-open-count' using errcode = 'P0002';
  end if;

  for v_line in
    select *
    from inventory_count_lines
    where inventory_count_id = v_count_id
      and difference_stock <> 0
  loop
    update inventory_items
      set current_stock = v_line.counted_stock
      where id = v_line.inventory_item_id;

    insert into inventory_movements (restaurant_id, inventory_item_id, type, quantity, previous_stock, new_stock, reason, created_by)
    values (p_restaurant_id, v_line.inventory_item_id, 'adjustment', v_line.counted_stock, v_line.expected_stock, v_line.counted_stock, 'Ajuste por conteo de inventario', auth.uid());
  end loop;

  update inventory_counts
    set status = 'closed',
        closed_by = auth.uid(),
        closed_at = now(),
        notes = coalesce(nullif(p_notes, ''), notes)
    where id = v_count_id;

  return v_count_id;
end;
$$;

create or replace function charge_order_with_cash_movement(
  p_restaurant_id uuid,
  p_order_id uuid,
  p_payment_method payment_method_type,
  p_receipt_url text default null,
  p_receipt_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_order orders%rowtype;
  v_now timestamptz := now();
begin
  if auth.uid() is null or not (is_superadmin() or has_restaurant_role(p_restaurant_id, array['restaurant_admin','cashier']::app_role[])) then
    raise exception 'cash access denied' using errcode = '42501';
  end if;

  select id into v_session_id from cash_sessions where restaurant_id = p_restaurant_id and status = 'open' order by opened_at desc limit 1 for update;
  if not found then
    raise exception 'no-open-session' using errcode = 'P0002';
  end if;

  select * into v_order from orders where restaurant_id = p_restaurant_id and id = p_order_id for update;
  if not found then
    raise exception 'order-not-found' using errcode = 'P0002';
  end if;

  if v_order.status = 'cancelled' then
    raise exception 'order-cancelled' using errcode = '22023';
  end if;

  if p_payment_method = 'qr'
    and coalesce(v_order.payment_receipt_url, p_receipt_url, '') = ''
    and coalesce(v_order.payment_receipt_reference, p_receipt_reference, '') = '' then
    raise exception 'receipt-required' using errcode = '22023';
  end if;

  update orders
    set payment_status = 'paid',
        payment_method = p_payment_method,
        payment_receipt_url = coalesce(p_receipt_url, payment_receipt_url),
        payment_receipt_uploaded_at = case when p_receipt_url is not null then v_now else payment_receipt_uploaded_at end,
        payment_receipt_reference = coalesce(nullif(p_receipt_reference, ''), payment_receipt_reference),
        payment_verified_at = v_now,
        status = 'accepted',
        accepted_at = coalesce(accepted_at, v_now),
        cancellation_reason = null
    where id = v_order.id;

  if v_order.payment_status <> 'paid' then
    insert into cash_movements (restaurant_id, cash_session_id, order_id, type, payment_method, amount, description, created_by)
    values (p_restaurant_id, v_session_id, v_order.id, 'sale', p_payment_method, v_order.total, 'Cobro de pedido ' || v_order.order_number, auth.uid());

    perform apply_order_inventory_usage(v_order.id);
  end if;

  return v_order.id;
end;
$$;

create or replace function create_pos_sale_with_cash_movement(
  p_restaurant_id uuid,
  p_order_number text,
  p_customer_name text,
  p_payment_method payment_method_type,
  p_receipt_url text default null,
  p_receipt_reference text default null,
  p_items jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_order_id uuid;
  v_total numeric;
  v_now timestamptz := now();
begin
  if auth.uid() is null or not (is_superadmin() or has_restaurant_role(p_restaurant_id, array['restaurant_admin','cashier']::app_role[])) then
    raise exception 'cash access denied' using errcode = '42501';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'invalid-pos-sale' using errcode = '22023';
  end if;

  if p_payment_method = 'qr' and coalesce(p_receipt_url, p_receipt_reference, '') = '' then
    raise exception 'receipt-required' using errcode = '22023';
  end if;

  select id into v_session_id from cash_sessions where restaurant_id = p_restaurant_id and status = 'open' order by opened_at desc limit 1 for update;
  if not found then
    raise exception 'no-open-session' using errcode = 'P0002';
  end if;

  with cart as (
    select * from jsonb_to_recordset(p_items) as item("productId" uuid, name text, price numeric, quantity integer, notes text)
  )
  select coalesce(sum(price * quantity), 0) into v_total from cart where price >= 0 and quantity > 0;

  if v_total <= 0 then
    raise exception 'invalid-pos-sale' using errcode = '22023';
  end if;

  if exists (
    with cart as (
      select * from jsonb_to_recordset(p_items) as item("productId" uuid, name text, price numeric, quantity integer, notes text)
    )
    select 1
    from cart
    left join products p on p.id = cart."productId" and p.restaurant_id = p_restaurant_id
    where p.id is null or p.is_available is not true or cart.price < 0 or cart.quantity <= 0
  ) then
    raise exception 'product-not-found' using errcode = '22023';
  end if;

  insert into orders (restaurant_id, order_number, customer_name, order_type, status, accepted_at, payment_status, payment_method, payment_receipt_url, payment_receipt_uploaded_at, payment_receipt_reference, payment_verified_at, subtotal, total)
  values (p_restaurant_id, p_order_number, nullif(p_customer_name, ''), 'pos', 'accepted', v_now, 'paid', p_payment_method, p_receipt_url, case when p_receipt_url is not null then v_now else null end, nullif(p_receipt_reference, ''), v_now, v_total, v_total)
  returning id into v_order_id;

  insert into order_items (order_id, product_id, product_name, unit_price, quantity, subtotal, notes)
  select v_order_id, item."productId", coalesce(nullif(item.name, ''), p.name), item.price, item.quantity, item.price * item.quantity, nullif(item.notes, '')
  from jsonb_to_recordset(p_items) as item("productId" uuid, name text, price numeric, quantity integer, notes text)
  join products p on p.id = item."productId" and p.restaurant_id = p_restaurant_id;

  perform apply_order_inventory_usage(v_order_id);

  insert into cash_movements (restaurant_id, cash_session_id, order_id, type, payment_method, amount, description, created_by)
  values (p_restaurant_id, v_session_id, v_order_id, 'sale', p_payment_method, v_total, 'Venta rapida POS ' || p_order_number, auth.uid());

  return v_order_id;
end;
$$;

grant execute on function register_inventory_movement_atomic(uuid, uuid, inventory_movement_type, numeric, text) to authenticated;
grant execute on function apply_order_inventory_usage(uuid) to authenticated;
grant execute on function open_inventory_count_atomic(uuid, text) to authenticated;
grant execute on function record_inventory_count_line_atomic(uuid, uuid, numeric, text) to authenticated;
grant execute on function close_inventory_count_atomic(uuid, text) to authenticated;
