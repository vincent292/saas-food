alter table order_delivery_links
  add column if not exists rider_latitude numeric(10,7),
  add column if not exists rider_longitude numeric(10,7),
  add column if not exists rider_location_accuracy_m numeric(8,2),
  add column if not exists rider_location_heading numeric(6,2),
  add column if not exists rider_location_speed_mps numeric(8,2),
  add column if not exists rider_location_updated_at timestamptz;

create index if not exists idx_delivery_links_rider_location_updated
  on order_delivery_links(order_id, rider_location_updated_at desc)
  where rider_location_updated_at is not null;

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

grant execute on function get_public_order(uuid, text) to anon, authenticated;

create or replace function update_rider_live_location(
  p_order_id uuid,
  p_latitude numeric,
  p_longitude numeric,
  p_accuracy_meters numeric default null,
  p_heading numeric default null,
  p_speed_mps numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link_id uuid;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  if p_latitude is null or p_longitude is null or p_latitude < -90 or p_latitude > 90 or p_longitude < -180 or p_longitude > 180 then
    raise exception 'invalid-rider-location';
  end if;

  select l.id
    into v_link_id
  from order_delivery_links l
  join restaurant_riders rr on rr.id = l.restaurant_rider_id
  where l.order_id = p_order_id
    and l.status in ('active', 'arrived')
    and rr.status = 'active'
    and rr.rider_user_id = auth.uid()
  limit 1;

  if v_link_id is null then
    raise exception 'rider-dispatch-not-found';
  end if;

  update order_delivery_links
  set rider_latitude = p_latitude,
      rider_longitude = p_longitude,
      rider_location_accuracy_m = p_accuracy_meters,
      rider_location_heading = p_heading,
      rider_location_speed_mps = p_speed_mps,
      rider_location_updated_at = now()
  where id = v_link_id;

  return jsonb_build_object('ok', true, 'order_id', p_order_id);
end;
$$;

grant execute on function update_rider_live_location(uuid, numeric, numeric, numeric, numeric, numeric) to authenticated;
