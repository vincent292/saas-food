create table if not exists restaurant_delivery_zones (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  city text,
  center_latitude numeric(10,7),
  center_longitude numeric(10,7),
  radius_km numeric(8,2) not null default 3,
  delivery_fee numeric(12,2) not null default 0,
  min_order_amount numeric(12,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_restaurant_delivery_zones_restaurant_active
  on restaurant_delivery_zones(restaurant_id, is_active);

drop trigger if exists restaurant_delivery_zones_updated_at on restaurant_delivery_zones;
create trigger restaurant_delivery_zones_updated_at
before update on restaurant_delivery_zones
for each row execute function set_updated_at();

alter table restaurant_delivery_zones enable row level security;

drop policy if exists "public read active restaurant delivery zones" on restaurant_delivery_zones;
create policy "public read active restaurant delivery zones"
on restaurant_delivery_zones
for select
using (
  is_active
  and exists (
    select 1
    from restaurants r
    where r.id = restaurant_delivery_zones.restaurant_id
      and r.status = 'active'
      and r.deleted_at is null
  )
);

drop policy if exists "members manage restaurant delivery zones" on restaurant_delivery_zones;
create policy "members manage restaurant delivery zones"
on restaurant_delivery_zones
for all
using (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[]))
with check (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[]));

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

grant execute on function get_public_order(uuid, text) to anon, authenticated;
grant execute on function get_delivery_order(text) to anon, authenticated;
