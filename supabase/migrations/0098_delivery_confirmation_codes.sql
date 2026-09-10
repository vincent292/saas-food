create or replace function generate_delivery_confirmation_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_bytes bytea := extensions.gen_random_bytes(2);
  v_number integer;
begin
  v_number := (get_byte(v_bytes, 0) * 256 + get_byte(v_bytes, 1)) % 10000;
  return lpad(v_number::text, 4, '0');
end;
$$;

alter table order_delivery_links
  add column if not exists pickup_confirmation_code text default generate_delivery_confirmation_code(),
  add column if not exists delivery_confirmation_code text default generate_delivery_confirmation_code(),
  add column if not exists pickup_code_verified_at timestamptz,
  add column if not exists delivery_code_verified_at timestamptz,
  add column if not exists pickup_code_attempts integer not null default 0,
  add column if not exists delivery_code_attempts integer not null default 0;

update order_delivery_links
set
  pickup_confirmation_code = coalesce(pickup_confirmation_code, generate_delivery_confirmation_code()),
  delivery_confirmation_code = coalesce(delivery_confirmation_code, generate_delivery_confirmation_code())
where pickup_confirmation_code is null
  or delivery_confirmation_code is null;

update order_delivery_links
set delivery_confirmation_code = generate_delivery_confirmation_code()
where pickup_confirmation_code = delivery_confirmation_code;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'order_delivery_links_pickup_code_format') then
    alter table order_delivery_links
      add constraint order_delivery_links_pickup_code_format
      check (pickup_confirmation_code is null or pickup_confirmation_code ~ '^[0-9]{4}$');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'order_delivery_links_delivery_code_format') then
    alter table order_delivery_links
      add constraint order_delivery_links_delivery_code_format
      check (delivery_confirmation_code is null or delivery_confirmation_code ~ '^[0-9]{4}$');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'order_delivery_links_distinct_codes') then
    alter table order_delivery_links
      add constraint order_delivery_links_distinct_codes
      check (
        pickup_confirmation_code is null
        or delivery_confirmation_code is null
        or pickup_confirmation_code <> delivery_confirmation_code
      );
  end if;
end;
$$;

create or replace function ensure_delivery_confirmation_codes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.pickup_confirmation_code is null then
    new.pickup_confirmation_code := generate_delivery_confirmation_code();
  end if;

  if new.delivery_confirmation_code is null then
    new.delivery_confirmation_code := generate_delivery_confirmation_code();
  end if;

  while new.delivery_confirmation_code = new.pickup_confirmation_code loop
    new.delivery_confirmation_code := generate_delivery_confirmation_code();
  end loop;

  return new;
end;
$$;

drop trigger if exists ensure_delivery_confirmation_codes_trigger on order_delivery_links;
create trigger ensure_delivery_confirmation_codes_trigger
before insert or update of pickup_confirmation_code, delivery_confirmation_code on order_delivery_links
for each row execute function ensure_delivery_confirmation_codes();

create or replace function get_public_order(p_order_id uuid, p_tracking_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'id', o.id,
    'restaurant_id', o.restaurant_id,
    'table_id', o.table_id,
    'order_number', o.order_number,
    'customer_name', o.customer_name,
    'customer_phone', o.customer_phone,
    'customer_email', o.customer_email,
    'customer_address', o.customer_address,
    'delivery_address_detail', o.delivery_address_detail,
    'delivery_latitude', o.delivery_latitude,
    'delivery_longitude', o.delivery_longitude,
    'delivery_maps_url', o.delivery_maps_url,
    'requested_fulfillment_at', o.requested_fulfillment_at,
    'invoice_required', o.invoice_required,
    'invoice_document_type', o.invoice_document_type,
    'invoice_document_number', o.invoice_document_number,
    'invoice_name', o.invoice_name,
    'order_type', o.order_type,
    'status', o.status,
    'payment_status', o.payment_status,
    'payment_method', o.payment_method,
    'payment_receipt_url', o.payment_receipt_url,
    'payment_receipt_uploaded_at', o.payment_receipt_uploaded_at,
    'payment_receipt_reference', o.payment_receipt_reference,
    'payment_verified_at', o.payment_verified_at,
    'subtotal', o.subtotal,
    'delivery_fee', o.delivery_fee,
    'discount_total', o.discount_total,
    'total', o.total,
    'notes', o.notes,
    'accepted_at', o.accepted_at,
    'preparing_at', o.preparing_at,
    'ready_at', o.ready_at,
    'delivered_at', o.delivered_at,
    'cancelled_at', o.cancelled_at,
    'printed_at', o.printed_at,
    'cancellation_reason', o.cancellation_reason,
    'created_at', o.created_at,
    'delivery_dispatch_status', l.status,
    'delivery_dispatch_phone', l.delivery_phone,
    'delivery_dispatch_name', l.delivery_name,
    'delivery_dispatched_at', l.created_at,
    'delivery_opened_at', l.opened_at,
    'delivery_arrived_at', l.arrived_at,
    'delivery_delivered_at', l.delivered_at,
    'delivery_confirmation_code', case
      when o.order_type = 'delivery'
        and o.status <> 'delivered'
        and l.status in ('active', 'arrived')
        and l.delivery_code_verified_at is null
      then l.delivery_confirmation_code
      else null
    end,
    'pickup_code_verified_at', l.pickup_code_verified_at,
    'delivery_code_verified_at', l.delivery_code_verified_at,
    'items', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', oi.id,
            'order_id', oi.order_id,
            'product_id', oi.product_id,
            'product_name', oi.product_name,
            'unit_price', oi.unit_price,
            'quantity', oi.quantity,
            'subtotal', oi.subtotal,
            'notes', oi.notes
          )
          order by oi.created_at asc
        )
        from order_items oi
        where oi.order_id = o.id
      ),
      '[]'::jsonb
    )
  ) || jsonb_build_object(
    'rider_latitude', l.rider_latitude,
    'rider_longitude', l.rider_longitude,
    'rider_location_accuracy_m', l.rider_location_accuracy_m,
    'rider_location_heading', l.rider_location_heading,
    'rider_location_speed_mps', l.rider_location_speed_mps,
    'rider_location_updated_at', l.rider_location_updated_at
  )
  into result
  from orders o
  left join order_delivery_links l on l.order_id = o.id
  where o.id = p_order_id
    and o.tracking_token = p_tracking_token;

  return result;
end;
$$;

create or replace function get_delivery_order(p_delivery_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link record;
  v_payload jsonb;
begin
  if p_delivery_token is null or length(trim(p_delivery_token)) < 20 then
    return null;
  end if;

  select l.*
  into v_link
  from order_delivery_links l
  where l.delivery_token = p_delivery_token
  limit 1;

  if not found then
    return null;
  end if;

  if v_link.status = 'expired' or (v_link.status in ('active', 'arrived') and v_link.expires_at < now()) then
    update order_delivery_links
    set
      status = 'expired',
      delivery_token = 'expired-' || id::text
    where id = v_link.id
      and status in ('active', 'arrived', 'expired');
    return null;
  end if;

  update order_delivery_links
  set opened_at = coalesce(opened_at, now())
  where id = v_link.id;

  select jsonb_build_object(
    'link_id', l.id,
    'delivery_token', l.delivery_token,
    'delivery_phone', l.delivery_phone,
    'delivery_name', l.delivery_name,
    'link_status', l.status,
    'opened_at', coalesce(l.opened_at, now()),
    'arrived_at', l.arrived_at,
    'link_delivered_at', l.delivered_at,
    'expires_at', l.expires_at,
    'pickup_code_verified_at', l.pickup_code_verified_at,
    'delivery_code_verified_at', l.delivery_code_verified_at,
    'restaurant_id', r.id,
    'restaurant_name', r.name,
    'restaurant_slug', r.slug,
    'restaurant_whatsapp', r.whatsapp,
    'order_id', o.id,
    'order_number', o.order_number,
    'order_status', o.status,
    'payment_status', o.payment_status,
    'payment_method', o.payment_method,
    'customer_name', o.customer_name,
    'customer_phone', o.customer_phone,
    'customer_address', o.customer_address,
    'delivery_address_detail', o.delivery_address_detail,
    'delivery_latitude', o.delivery_latitude,
    'delivery_longitude', o.delivery_longitude,
    'delivery_maps_url', o.delivery_maps_url,
    'requested_fulfillment_at', o.requested_fulfillment_at,
    'notes', o.notes,
    'subtotal', o.subtotal,
    'delivery_fee', o.delivery_fee,
    'discount_total', o.discount_total,
    'total', o.total,
    'created_at', o.created_at,
    'ready_at', o.ready_at,
    'delivered_at', o.delivered_at,
    'items', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', oi.id,
            'product_name', oi.product_name,
            'unit_price', oi.unit_price,
            'quantity', oi.quantity,
            'subtotal', oi.subtotal,
            'notes', oi.notes
          )
          order by oi.created_at asc
        )
        from order_items oi
        where oi.order_id = o.id
      ),
      '[]'::jsonb
    )
  )
  into v_payload
  from order_delivery_links l
  join orders o on o.id = l.order_id
  join restaurants r on r.id = l.restaurant_id
  where l.id = v_link.id
    and o.order_type = 'delivery'
    and o.status <> 'cancelled';

  return v_payload;
end;
$$;

drop function if exists mark_delivery_order_arrived(text);
drop function if exists mark_delivery_order_delivered(text);

create or replace function mark_delivery_order_arrived(p_delivery_token text, p_confirmation_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link record;
  v_order record;
  v_now timestamptz := now();
  v_status_changed boolean;
  v_code text := regexp_replace(coalesce(p_confirmation_code, ''), '\D', '', 'g');
begin
  if p_delivery_token is null or length(trim(p_delivery_token)) < 20 then
    raise exception 'invalid-delivery-token' using errcode = '22023';
  end if;

  select * into v_link
  from order_delivery_links
  where delivery_token = p_delivery_token
  for update;

  if not found then
    raise exception 'delivery-link-not-found' using errcode = 'P0002';
  end if;

  if v_link.status in ('cancelled', 'expired', 'delivered') or v_link.expires_at < v_now then
    update order_delivery_links
    set status = case when status in ('active', 'arrived') then 'expired' else status end
    where id = v_link.id;
    raise exception 'delivery-link-not-active' using errcode = '22023';
  end if;

  select * into v_order
  from orders
  where id = v_link.order_id
  for update;

  if not found or v_order.order_type <> 'delivery' or v_order.status = 'cancelled' then
    raise exception 'order-not-deliverable' using errcode = '22023';
  end if;

  if v_link.pickup_code_verified_at is null then
    if v_link.pickup_code_attempts >= 5 then
      raise exception 'confirmation-code-locked' using errcode = '22023';
    end if;

    if length(v_code) <> 4 or v_code <> v_link.pickup_confirmation_code then
      update order_delivery_links
      set pickup_code_attempts = pickup_code_attempts + 1
      where id = v_link.id;
      raise exception 'invalid-confirmation-code' using errcode = '22023';
    end if;
  end if;

  v_status_changed := v_link.status <> 'arrived';

  update order_delivery_links
  set
    status = 'arrived',
    arrived_at = coalesce(arrived_at, v_now),
    pickup_code_verified_at = coalesce(pickup_code_verified_at, v_now),
    pickup_code_attempts = 0
  where id = v_link.id;

  return jsonb_build_object(
    'order_id', v_order.id,
    'restaurant_id', v_order.restaurant_id,
    'status', 'arrived',
    'status_changed', v_status_changed,
    'arrived_at', coalesce(v_link.arrived_at, v_now),
    'pickup_code_verified_at', coalesce(v_link.pickup_code_verified_at, v_now)
  );
end;
$$;

create or replace function mark_delivery_order_delivered(p_delivery_token text, p_confirmation_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link record;
  v_order record;
  v_now timestamptz := now();
  v_status_changed boolean;
  v_code text := regexp_replace(coalesce(p_confirmation_code, ''), '\D', '', 'g');
begin
  if p_delivery_token is null or length(trim(p_delivery_token)) < 20 then
    raise exception 'invalid-delivery-token' using errcode = '22023';
  end if;

  select * into v_link
  from order_delivery_links
  where delivery_token = p_delivery_token
  for update;

  if not found then
    raise exception 'delivery-link-not-found' using errcode = 'P0002';
  end if;

  if v_link.status in ('cancelled', 'expired') or v_link.expires_at < v_now then
    update order_delivery_links
    set status = case when status in ('active', 'arrived') then 'expired' else status end
    where id = v_link.id;
    raise exception 'delivery-link-expired' using errcode = '22023';
  end if;

  select * into v_order
  from orders
  where id = v_link.order_id
  for update;

  if not found or v_order.order_type <> 'delivery' or v_order.status = 'cancelled' then
    raise exception 'order-not-deliverable' using errcode = '22023';
  end if;

  if v_link.pickup_code_verified_at is null then
    raise exception 'pickup-code-required' using errcode = '22023';
  end if;

  if v_link.delivery_code_verified_at is null then
    if v_link.delivery_code_attempts >= 5 then
      raise exception 'confirmation-code-locked' using errcode = '22023';
    end if;

    if length(v_code) <> 4 or v_code <> v_link.delivery_confirmation_code then
      update order_delivery_links
      set delivery_code_attempts = delivery_code_attempts + 1
      where id = v_link.id;
      raise exception 'invalid-confirmation-code' using errcode = '22023';
    end if;
  end if;

  v_status_changed := v_link.status <> 'delivered' or v_order.status <> 'delivered';

  update orders
  set status = 'delivered', delivered_at = coalesce(delivered_at, v_now)
  where id = v_order.id;

  update order_delivery_links
  set
    status = 'delivered',
    arrived_at = coalesce(arrived_at, v_now),
    delivered_at = coalesce(delivered_at, v_now),
    delivery_code_verified_at = coalesce(delivery_code_verified_at, v_now),
    delivery_code_attempts = 0
  where id = v_link.id;

  return jsonb_build_object(
    'order_id', v_order.id,
    'restaurant_id', v_order.restaurant_id,
    'status', 'delivered',
    'status_changed', v_status_changed,
    'delivered_at', coalesce(v_link.delivered_at, v_now),
    'delivery_code_verified_at', coalesce(v_link.delivery_code_verified_at, v_now)
  );
end;
$$;

grant execute on function get_public_order(uuid, text) to anon, authenticated;
grant execute on function get_delivery_order(text) to anon, authenticated;
grant execute on function mark_delivery_order_arrived(text, text) to anon, authenticated;
grant execute on function mark_delivery_order_delivered(text, text) to anon, authenticated;
