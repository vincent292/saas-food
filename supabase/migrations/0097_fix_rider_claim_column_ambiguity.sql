create or replace function public.claim_rider_delivery_order(
  p_order_id uuid,
  p_restaurant_id uuid,
  p_restaurant_rider_id uuid,
  p_rider_offer_id uuid default null,
  p_delivery_token text default null,
  p_delivery_name text default null,
  p_delivery_phone text default null,
  p_dispatch_source text default 'rider_manual',
  p_expires_at timestamptz default null
)
returns table(status text, link_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_link order_delivery_links%rowtype;
  v_now timestamptz := now();
  v_token text := coalesce(nullif(p_delivery_token, ''), replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''));
  v_expires_at timestamptz := coalesce(p_expires_at, now() + interval '24 hours');
begin
  if p_dispatch_source not in ('rider_auto', 'rider_manual') then
    status := 'invalid-dispatch-source';
    link_id := null;
    return next;
    return;
  end if;

  select o.id, o.restaurant_id, o.order_type, o.status
    into v_order
    from orders o
   where o.id = p_order_id
   for update;

  if not found
     or v_order.restaurant_id <> p_restaurant_id
     or v_order.order_type <> 'delivery'
     or v_order.status <> 'ready' then
    status := 'order-not-available';
    link_id := null;
    return next;
    return;
  end if;

  select *
    into v_link
    from order_delivery_links l
   where l.order_id = p_order_id
   for update;

  if found then
    if v_link.status = 'delivered' then
      status := 'order-already-delivered';
      link_id := v_link.id;
      return next;
      return;
    end if;

    if v_link.restaurant_rider_id is not null
       and v_link.restaurant_rider_id <> p_restaurant_rider_id
       and v_link.status in ('active', 'arrived')
       and v_link.expires_at > v_now then
      status := 'order-already-assigned';
      link_id := v_link.id;
      return next;
      return;
    end if;

    if v_link.restaurant_rider_id = p_restaurant_rider_id
       and v_link.status in ('active', 'arrived')
       and v_link.expires_at > v_now then
      status := 'claimed';
      link_id := v_link.id;
      return next;
      return;
    end if;

    update order_delivery_links
       set assigned_at = v_now,
           delivery_name = p_delivery_name,
           delivery_phone = p_delivery_phone,
           delivery_token = v_token,
           dispatch_source = p_dispatch_source,
           expires_at = v_expires_at,
           opened_at = null,
           arrived_at = null,
           delivered_at = null,
           restaurant_rider_id = p_restaurant_rider_id,
           rider_offer_id = p_rider_offer_id,
           status = 'active'
     where id = v_link.id
     returning id into link_id;

    status := 'claimed';
    return next;
    return;
  end if;

  insert into order_delivery_links (
    assigned_at,
    delivery_name,
    delivery_phone,
    delivery_token,
    dispatch_source,
    expires_at,
    order_id,
    restaurant_id,
    restaurant_rider_id,
    rider_offer_id,
    status
  )
  values (
    v_now,
    p_delivery_name,
    p_delivery_phone,
    v_token,
    p_dispatch_source,
    v_expires_at,
    p_order_id,
    p_restaurant_id,
    p_restaurant_rider_id,
    p_rider_offer_id,
    'active'
  )
  returning id into link_id;

  status := 'claimed';
  return next;
end;
$$;

grant execute on function public.claim_rider_delivery_order(uuid, uuid, uuid, uuid, text, text, text, text, timestamptz) to authenticated, service_role;
