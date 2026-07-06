create or replace function expire_old_delivery_links()
returns void
language sql
security definer
set search_path = public
as $$
  update order_delivery_links
  set
    status = 'expired',
    delivery_token = 'expired-' || id::text
  where status in ('active', 'arrived')
    and expires_at < now();
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

grant execute on function expire_old_delivery_links() to anon, authenticated;
grant execute on function get_delivery_order(text) to anon, authenticated;
