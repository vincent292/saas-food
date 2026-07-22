alter table orders
  add column if not exists public_request_id uuid;

create unique index if not exists idx_orders_public_request_id
  on orders(restaurant_id, public_request_id)
  where public_request_id is not null;

drop policy if exists "public creates orders" on orders;
drop policy if exists "public creates order items" on order_items;

revoke insert on orders from anon, authenticated;
revoke insert on order_items from anon, authenticated;

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

  insert into order_items (order_id, product_id, product_name, unit_price, quantity, subtotal, notes)
  select
    v_order_id,
    item.product_id,
    item.product_name,
    item.unit_price,
    item.quantity,
    item.subtotal,
    nullif(item.notes, '')
  from jsonb_to_recordset(p_items) as item(
    product_id uuid,
    product_name text,
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
