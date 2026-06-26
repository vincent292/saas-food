alter table orders
  add column if not exists payment_receipt_reference text;

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
    'customer_address', o.customer_address,
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
