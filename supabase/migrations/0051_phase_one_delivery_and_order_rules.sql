alter table restaurant_settings
  add column if not exists far_delivery_distance_km numeric(6,2) not null default 8;

alter table restaurant_settings
  drop constraint if exists restaurant_settings_far_delivery_distance_check,
  add constraint restaurant_settings_far_delivery_distance_check
    check (far_delivery_distance_km between 1 and 100);

alter table orders
  add column if not exists delivery_distance_km numeric(7,2),
  add column if not exists requires_prepayment boolean not null default false;

alter table orders
  drop constraint if exists orders_delivery_distance_check,
  add constraint orders_delivery_distance_check
    check (delivery_distance_km is null or delivery_distance_km >= 0),
  drop constraint if exists orders_required_prepayment_method_check,
  add constraint orders_required_prepayment_method_check
    check (requires_prepayment is false or payment_method = 'qr');

create or replace function validate_order_status_transition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if not (
    (old.status = 'pending' and new.status in ('accepted', 'cancelled'))
    or (old.status = 'accepted' and new.status in ('preparing', 'cancelled'))
    or (old.status = 'preparing' and new.status in ('ready', 'cancelled'))
    or (old.status = 'ready' and new.status in ('delivered', 'cancelled'))
  ) then
    raise exception 'invalid-order-transition:%->%', old.status, new.status using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists orders_validate_status_transition on orders;
create trigger orders_validate_status_transition
before update of status on orders
for each row execute function validate_order_status_transition();

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
  v_requires_prepayment boolean;
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
  v_requires_prepayment := coalesce((p_order->>'requires_prepayment')::boolean, false);

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

  if v_requires_prepayment and (
    p_order->>'payment_method' <> 'qr'
    or coalesce(p_order->>'payment_receipt_url', '') = ''
  ) then
    raise exception 'prepayment-required' using errcode = '22023';
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
    delivery_distance_km,
    requires_prepayment,
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
    nullif(p_order->>'delivery_distance_km', '')::numeric,
    v_requires_prepayment,
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
