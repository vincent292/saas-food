alter table products
  add column if not exists product_kind text not null default 'standard',
  add column if not exists compare_at_price numeric(12,2),
  add column if not exists available_from timestamptz,
  add column if not exists available_until timestamptz,
  add column if not exists available_days integer[],
  add column if not exists available_start_time time,
  add column if not exists available_end_time time;

alter table products
  drop constraint if exists products_product_kind_check,
  add constraint products_product_kind_check check (product_kind in ('standard', 'promotion', 'lunch')),
  drop constraint if exists products_compare_at_price_check,
  add constraint products_compare_at_price_check check (compare_at_price is null or compare_at_price >= price),
  drop constraint if exists products_available_days_check,
  add constraint products_available_days_check check (
    available_days is null
    or (
      array_length(available_days, 1) between 1 and 7
      and available_days <@ array[0,1,2,3,4,5,6]
    )
  );

create index if not exists idx_products_public_schedule
  on products (restaurant_id, is_available, product_kind, available_from, available_until);

alter table product_options
  add column if not exists inventory_item_id uuid references inventory_items(id) on delete set null,
  add column if not exists inventory_quantity numeric(12,3),
  add column if not exists inventory_waste_factor numeric(5,2) not null default 0;

alter table product_options
  drop constraint if exists product_options_inventory_quantity_check,
  add constraint product_options_inventory_quantity_check check (inventory_quantity is null or inventory_quantity > 0),
  drop constraint if exists product_options_inventory_waste_factor_check,
  add constraint product_options_inventory_waste_factor_check check (inventory_waste_factor >= 0);

create index if not exists idx_product_options_inventory_item
  on product_options (restaurant_id, inventory_item_id)
  where inventory_item_id is not null;

alter table order_items
  add column if not exists variant_id uuid references product_variants(id) on delete set null,
  add column if not exists option_ids uuid[] not null default '{}'::uuid[];

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
  v_movement_id uuid;
begin
  select * into v_order from orders where id = p_order_id;

  if not found then
    raise exception 'order-not-found' using errcode = 'P0002';
  end if;

  v_zone_id := create_default_inventory_zone(v_order.restaurant_id);

  for v_usage in
    with base_usage as (
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
    ),
    option_usage as (
      select
        po.inventory_item_id,
        ii.name,
        sum(oi.quantity * coalesce(po.inventory_quantity, 1) * (1 + (po.inventory_waste_factor / 100)))::numeric(12,3) as total_quantity
      from order_items oi
      cross join lateral unnest(coalesce(oi.option_ids, '{}'::uuid[])) as selected(option_id)
      join product_options po
        on po.id = selected.option_id
        and po.restaurant_id = v_order.restaurant_id
        and po.inventory_item_id is not null
      join inventory_items ii on ii.id = po.inventory_item_id
      where oi.order_id = p_order_id
        and ii.is_active = true
      group by po.inventory_item_id, ii.name
    )
    select inventory_item_id, name, sum(total_quantity)::numeric(12,3) as total_quantity
    from (
      select * from base_usage
      union all
      select * from option_usage
    ) usage_rows
    group by inventory_item_id, name
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

    v_new := greatest(coalesce(v_previous, 0) - v_usage.total_quantity, 0);

    update inventory_items
      set current_stock = v_new
      where id = v_usage.inventory_item_id;

    update inventory_item_zones
      set stock = greatest(stock - v_usage.total_quantity, 0),
          updated_at = now()
      where inventory_item_id = v_usage.inventory_item_id
        and zone_id = v_zone_id
        and stock >= v_usage.total_quantity;

    insert into inventory_movements (
      restaurant_id,
      inventory_item_id,
      type,
      quantity,
      previous_stock,
      new_stock,
      reason,
      created_by,
      from_zone_id,
      to_zone_id,
      supplier_id,
      order_id
    )
    values (
      v_order.restaurant_id,
      v_usage.inventory_item_id,
      'sale_usage',
      v_usage.total_quantity,
      coalesce(v_previous, 0),
      v_new,
      'Uso por venta ' || v_order.order_number,
      auth.uid(),
      v_zone_id,
      null,
      null,
      p_order_id
    )
    returning id into v_movement_id;
  end loop;
end;
$$;

create or replace function create_public_order_transaction(
  p_request_id uuid,
  p_order jsonb,
  p_items jsonb
)
returns table (id uuid, tracking_token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_tracking_token text;
  v_restaurant_id uuid;
  v_subtotal numeric(12,2);
  v_delivery_fee numeric(12,2);
  v_discount_total numeric(12,2);
  v_total numeric(12,2);
  v_items_total numeric(12,2);
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service-role-required' using errcode = '42501';
  end if;

  if p_request_id is null or jsonb_typeof(p_order) <> 'object' or jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid-public-order' using errcode = '22023';
  end if;

  if jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 100 then
    raise exception 'invalid-public-order-items' using errcode = '22023';
  end if;

  v_restaurant_id := (p_order->>'restaurant_id')::uuid;

  select o.id, o.tracking_token
    into v_order_id, v_tracking_token
  from orders o
  where o.restaurant_id = v_restaurant_id
    and o.public_request_id = p_request_id;

  if v_order_id is not null then
    return query select v_order_id, v_tracking_token;
    return;
  end if;

  if not exists (
    select 1
    from restaurants r
    where r.id = v_restaurant_id
      and r.status = 'active'
      and r.deleted_at is null
  ) then
    raise exception 'invalid-restaurant' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from cash_sessions cs
    where cs.restaurant_id = v_restaurant_id
      and cs.status = 'open'
  ) then
    raise exception 'no-open-cash' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as item(
      product_id uuid,
      product_name text,
      variant_id uuid,
      option_ids jsonb,
      unit_price numeric,
      quantity integer,
      subtotal numeric,
      notes text
    )
    left join products p
      on p.id = item.product_id
      and p.restaurant_id = v_restaurant_id
      and p.is_available is true
    where p.id is null
      or item.quantity <= 0
      or item.unit_price < 0
      or item.subtotal <> round(item.unit_price * item.quantity, 2)
  ) then
    raise exception 'invalid-public-order-items' using errcode = '22023';
  end if;

  select coalesce(sum(item.subtotal), 0)
    into v_items_total
  from jsonb_to_recordset(p_items) as item(subtotal numeric);

  v_subtotal := round(coalesce((p_order->>'subtotal')::numeric, 0), 2);
  v_delivery_fee := round(coalesce((p_order->>'delivery_fee')::numeric, 0), 2);
  v_discount_total := round(coalesce((p_order->>'discount_total')::numeric, 0), 2);
  v_total := round(coalesce((p_order->>'total')::numeric, 0), 2);

  if v_subtotal <> round(v_items_total, 2)
    or v_delivery_fee < 0
    or v_discount_total < 0
    or v_total <> round(v_subtotal + v_delivery_fee - v_discount_total, 2)
    or v_total < 0 then
    raise exception 'invalid-public-order-total' using errcode = '22023';
  end if;

  insert into orders (
    restaurant_id,
    table_id,
    order_number,
    public_request_id,
    customer_name,
    customer_phone,
    customer_email,
    customer_address,
    delivery_address_detail,
    delivery_latitude,
    delivery_longitude,
    delivery_maps_url,
    requested_fulfillment_at,
    invoice_required,
    invoice_document_type,
    invoice_document_number,
    invoice_name,
    order_type,
    order_origin,
    status,
    payment_status,
    payment_method,
    payment_receipt_url,
    payment_receipt_uploaded_at,
    subtotal,
    delivery_fee,
    discount_total,
    total,
    notes
  )
  values (
    v_restaurant_id,
    nullif(p_order->>'table_id', '')::uuid,
    p_order->>'order_number',
    p_request_id,
    nullif(p_order->>'customer_name', ''),
    nullif(p_order->>'customer_phone', ''),
    nullif(p_order->>'customer_email', ''),
    nullif(p_order->>'customer_address', ''),
    nullif(p_order->>'delivery_address_detail', ''),
    nullif(p_order->>'delivery_latitude', '')::numeric,
    nullif(p_order->>'delivery_longitude', '')::numeric,
    nullif(p_order->>'delivery_maps_url', ''),
    nullif(p_order->>'requested_fulfillment_at', '')::timestamptz,
    coalesce((p_order->>'invoice_required')::boolean, false),
    nullif(p_order->>'invoice_document_type', ''),
    nullif(p_order->>'invoice_document_number', ''),
    nullif(p_order->>'invoice_name', ''),
    (p_order->>'order_type')::order_type,
    (p_order->>'order_origin')::order_origin,
    'pending',
    'pending',
    (p_order->>'payment_method')::payment_method_type,
    nullif(p_order->>'payment_receipt_url', ''),
    nullif(p_order->>'payment_receipt_uploaded_at', '')::timestamptz,
    v_subtotal,
    v_delivery_fee,
    v_discount_total,
    v_total,
    nullif(p_order->>'notes', '')
  )
  returning orders.id, orders.tracking_token
    into v_order_id, v_tracking_token;

  insert into order_items (order_id, product_id, product_name, variant_id, option_ids, unit_price, quantity, subtotal, notes)
  select
    v_order_id,
    item.product_id,
    item.product_name,
    item.variant_id,
    coalesce(
      array(select jsonb_array_elements_text(coalesce(item.option_ids, '[]'::jsonb))::uuid),
      '{}'::uuid[]
    ),
    item.unit_price,
    item.quantity,
    item.subtotal,
    nullif(item.notes, '')
  from jsonb_to_recordset(p_items) as item(
    product_id uuid,
    product_name text,
    variant_id uuid,
    option_ids jsonb,
    unit_price numeric,
    quantity integer,
    subtotal numeric,
    notes text
  );

  return query select v_order_id, v_tracking_token;
end;
$$;

revoke all on function create_public_order_transaction(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function create_public_order_transaction(uuid, jsonb, jsonb) to service_role;

create or replace function create_pos_sale_with_cash_movement(
  p_restaurant_id uuid,
  p_order_number text,
  p_customer_name text,
  p_payment_method payment_method_type,
  p_receipt_url text default null,
  p_receipt_reference text default null,
  p_items jsonb default '[]'::jsonb,
  p_customer_phone text default null,
  p_order_origin order_origin default 'pos_counter'
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

  select id
    into v_session_id
    from cash_sessions
    where restaurant_id = p_restaurant_id
      and status = 'open'
    order by opened_at desc
    limit 1
    for update;

  if not found then
    raise exception 'no-open-session' using errcode = 'P0002';
  end if;

  if exists (
    with cart as (
      select row_number() over () as line_id, item.*
      from jsonb_to_recordset(p_items) as item(
        "productId" uuid,
        "variantId" uuid,
        "optionIds" jsonb,
        name text,
        price numeric,
        quantity integer,
        notes text
      )
    )
    select 1
    from cart
    left join products p on p.id = cart."productId" and p.restaurant_id = p_restaurant_id
    left join product_variants pv on pv.id = cart."variantId" and pv.restaurant_id = p_restaurant_id
    where p.id is null
      or p.is_available is not true
      or cart.quantity <= 0
      or (cart."variantId" is null and exists (
        select 1
        from product_variants required_pv
        where required_pv.restaurant_id = p_restaurant_id
          and required_pv.product_id = cart."productId"
          and required_pv.is_active is true
      ))
      or (cart."variantId" is not null and (pv.id is null or pv.product_id <> cart."productId" or pv.is_active is not true))
  ) then
    raise exception 'product-not-found' using errcode = '22023';
  end if;

  if exists (
    with cart as (
      select row_number() over () as line_id, item.*
      from jsonb_to_recordset(p_items) as item(
        "productId" uuid,
        "variantId" uuid,
        "optionIds" jsonb,
        name text,
        price numeric,
        quantity integer,
        notes text
      )
    ),
    selected_options as (
      select cart.line_id, cart."productId", selected.option_id::uuid as option_id
      from cart
      cross join lateral jsonb_array_elements_text(coalesce(cart."optionIds", '[]'::jsonb)) as selected(option_id)
    )
    select 1
    from selected_options so
    left join product_options po on po.id = so.option_id and po.restaurant_id = p_restaurant_id
    where po.id is null
      or po.product_id <> so."productId"
      or po.is_active is not true
  ) then
    raise exception 'product-configuration' using errcode = '22023';
  end if;

  if exists (
    with cart as (
      select row_number() over () as line_id, item.*
      from jsonb_to_recordset(p_items) as item(
        "productId" uuid,
        "variantId" uuid,
        "optionIds" jsonb,
        name text,
        price numeric,
        quantity integer,
        notes text
      )
    ),
    selected_options as (
      select cart.line_id, selected.option_id::uuid as option_id
      from cart
      cross join lateral jsonb_array_elements_text(coalesce(cart."optionIds", '[]'::jsonb)) as selected(option_id)
    ),
    group_counts as (
      select so.line_id, po.option_group_id, count(*) as selected_count
      from selected_options so
      join product_options po on po.id = so.option_id and po.restaurant_id = p_restaurant_id and po.is_active is true
      group by so.line_id, po.option_group_id
    )
    select 1
    from cart
    join product_option_groups pog on pog.product_id = cart."productId" and pog.restaurant_id = p_restaurant_id and pog.is_active is true
    left join group_counts gc on gc.line_id = cart.line_id and gc.option_group_id = pog.id
    where coalesce(gc.selected_count, 0) < pog.min_choices
      or coalesce(gc.selected_count, 0) > pog.max_choices
      or (pog.is_required is true and coalesce(gc.selected_count, 0) = 0)
  ) then
    raise exception 'product-configuration' using errcode = '22023';
  end if;

  with cart as (
    select row_number() over () as line_id, item.*
    from jsonb_to_recordset(p_items) as item(
      "productId" uuid,
      "variantId" uuid,
      "optionIds" jsonb,
      name text,
      price numeric,
      quantity integer,
      notes text
    )
  ),
  selected_options as (
    select cart.line_id, selected.option_id::uuid as option_id
    from cart
    cross join lateral jsonb_array_elements_text(coalesce(cart."optionIds", '[]'::jsonb)) as selected(option_id)
  ),
  option_totals as (
    select
      so.line_id,
      coalesce(sum(po.price_delta), 0) as options_total
    from selected_options so
    join product_options po on po.id = so.option_id and po.restaurant_id = p_restaurant_id and po.is_active is true
    group by so.line_id
  ),
  calculated as (
    select
      cart.line_id,
      cart.quantity,
      (p.price + coalesce(pv.price_delta, 0) + coalesce(ot.options_total, 0)) as unit_price
    from cart
    join products p on p.id = cart."productId" and p.restaurant_id = p_restaurant_id
    left join product_variants pv on pv.id = cart."variantId" and pv.restaurant_id = p_restaurant_id
    left join option_totals ot on ot.line_id = cart.line_id
  )
  select coalesce(sum(unit_price * quantity), 0)
    into v_total
    from calculated;

  if v_total <= 0 then
    raise exception 'invalid-pos-sale' using errcode = '22023';
  end if;

  insert into orders (
    restaurant_id,
    order_number,
    customer_name,
    customer_phone,
    order_type,
    order_origin,
    status,
    accepted_at,
    payment_status,
    payment_method,
    payment_receipt_url,
    payment_receipt_uploaded_at,
    payment_receipt_reference,
    payment_verified_at,
    subtotal,
    total
  )
  values (
    p_restaurant_id,
    p_order_number,
    nullif(p_customer_name, ''),
    nullif(p_customer_phone, ''),
    'pos',
    p_order_origin,
    'accepted',
    v_now,
    'paid',
    p_payment_method,
    p_receipt_url,
    case when p_receipt_url is not null then v_now else null end,
    nullif(p_receipt_reference, ''),
    v_now,
    v_total,
    v_total
  )
  returning id into v_order_id;

  insert into order_items (order_id, product_id, product_name, variant_id, option_ids, unit_price, quantity, subtotal, notes)
  with cart as (
    select row_number() over () as line_id, item.*
    from jsonb_to_recordset(p_items) as item(
      "productId" uuid,
      "variantId" uuid,
      "optionIds" jsonb,
      name text,
      price numeric,
      quantity integer,
      notes text
    )
  ),
  selected_options as (
    select cart.line_id, selected.option_id::uuid as option_id
    from cart
    cross join lateral jsonb_array_elements_text(coalesce(cart."optionIds", '[]'::jsonb)) as selected(option_id)
  ),
  option_details as (
    select
      so.line_id,
      coalesce(sum(po.price_delta), 0) as options_total,
      string_agg(po.name, ' | ' order by po.sort_order) as option_notes
    from selected_options so
    join product_options po on po.id = so.option_id and po.restaurant_id = p_restaurant_id and po.is_active is true
    group by so.line_id
  )
  select
    v_order_id,
    p.id,
    case when pv.id is not null then p.name || ' - ' || pv.name else p.name end,
    pv.id,
    coalesce(
      array(select jsonb_array_elements_text(coalesce(cart."optionIds", '[]'::jsonb))::uuid),
      '{}'::uuid[]
    ),
    p.price + coalesce(pv.price_delta, 0) + coalesce(od.options_total, 0),
    cart.quantity,
    (p.price + coalesce(pv.price_delta, 0) + coalesce(od.options_total, 0)) * cart.quantity,
    nullif(concat_ws(' | ', od.option_notes, nullif(cart.notes, '')), '')
  from cart
  join products p on p.id = cart."productId" and p.restaurant_id = p_restaurant_id
  left join product_variants pv on pv.id = cart."variantId" and pv.restaurant_id = p_restaurant_id
  left join option_details od on od.line_id = cart.line_id;

  insert into cash_movements (restaurant_id, cash_session_id, order_id, type, payment_method, amount, description, created_by)
  values (p_restaurant_id, v_session_id, v_order_id, 'sale', p_payment_method, v_total, 'Venta rapida POS ' || p_order_number, auth.uid());

  return v_order_id;
end;
$$;
