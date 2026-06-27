alter table products
  add column if not exists order_count integer not null default 0,
  add column if not exists last_ordered_at timestamptz;

update products p
set
  order_count = coalesce(stats.total_quantity, 0),
  last_ordered_at = stats.last_ordered_at
from (
  select
    oi.product_id,
    sum(oi.quantity)::integer as total_quantity,
    max(o.created_at) as last_ordered_at
  from order_items oi
  join orders o on o.id = oi.order_id
  where oi.product_id is not null
  group by oi.product_id
) stats
where p.id = stats.product_id;

create or replace function increment_product_order_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.product_id is not null then
    update products
    set
      order_count = order_count + new.quantity,
      last_ordered_at = now()
    where id = new.product_id;
  end if;

  return new;
end;
$$;

drop trigger if exists order_items_increment_product_order_count on order_items;
create trigger order_items_increment_product_order_count
after insert on order_items
for each row execute function increment_product_order_count();

alter table restaurants
  add column if not exists background_color text not null default '#f7faf7',
  add column if not exists surface_color text not null default '#ffffff',
  add column if not exists text_color text not null default '#142018',
  add column if not exists muted_color text not null default '#68766c',
  add column if not exists border_color text not null default '#dfe8e2',
  add column if not exists menu_background_image_url text,
  add column if not exists public_banner_size text not null default 'compact',
  add column if not exists latitude numeric(10,7),
  add column if not exists longitude numeric(10,7),
  add column if not exists maps_url text,
  add column if not exists address_reference text;

alter table restaurant_settings
  add column if not exists qr_account_name text,
  add column if not exists qr_account_document text,
  add column if not exists qr_bank_name text,
  add column if not exists qr_account_type text,
  add column if not exists qr_currency text not null default 'BOB';

alter table orders
  add column if not exists requested_fulfillment_at timestamptz,
  add column if not exists delivery_address_detail text,
  add column if not exists delivery_latitude numeric(10,7),
  add column if not exists delivery_longitude numeric(10,7),
  add column if not exists delivery_maps_url text,
  add column if not exists customer_email text,
  add column if not exists invoice_required boolean not null default false,
  add column if not exists invoice_document_type text,
  add column if not exists invoice_document_number text,
  add column if not exists invoice_name text;

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
        )
        from order_items oi
        where oi.order_id = o.id
      ),
      '[]'::jsonb
    )
  )
  into result
  from orders o
  where o.id = p_order_id
    and o.tracking_token = p_tracking_token;

  return result;
end;
$$;

grant execute on function get_public_order(uuid, text) to anon, authenticated;
