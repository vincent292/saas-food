create or replace function mark_delivery_order_arrived(p_delivery_token text)
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

  v_status_changed := v_link.status <> 'arrived';

  update order_delivery_links
  set status = 'arrived', arrived_at = coalesce(arrived_at, v_now)
  where id = v_link.id;

  return jsonb_build_object(
    'order_id', v_order.id,
    'restaurant_id', v_order.restaurant_id,
    'status', 'arrived',
    'status_changed', v_status_changed,
    'arrived_at', coalesce(v_link.arrived_at, v_now)
  );
end;
$$;

create or replace function mark_delivery_order_delivered(p_delivery_token text)
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

  v_status_changed := v_link.status <> 'delivered' or v_order.status <> 'delivered';

  update orders
  set status = 'delivered', delivered_at = coalesce(delivered_at, v_now)
  where id = v_order.id;

  update order_delivery_links
  set
    status = 'delivered',
    arrived_at = coalesce(arrived_at, v_now),
    delivered_at = coalesce(delivered_at, v_now)
  where id = v_link.id;

  return jsonb_build_object(
    'order_id', v_order.id,
    'restaurant_id', v_order.restaurant_id,
    'status', 'delivered',
    'status_changed', v_status_changed,
    'delivered_at', coalesce(v_link.delivered_at, v_now)
  );
end;
$$;

grant execute on function mark_delivery_order_arrived(text) to anon, authenticated;
grant execute on function mark_delivery_order_delivered(text) to anon, authenticated;
