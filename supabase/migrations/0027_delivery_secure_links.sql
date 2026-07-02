create table if not exists order_delivery_links (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  order_id uuid not null unique references orders(id) on delete cascade,
  delivery_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  delivery_phone text,
  delivery_name text,
  status text not null default 'active' check (status in ('active', 'delivered', 'cancelled', 'expired')),
  opened_at timestamptz,
  delivered_at timestamptz,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_delivery_links_token on order_delivery_links(delivery_token);
create index if not exists idx_delivery_links_order on order_delivery_links(order_id);
create index if not exists idx_delivery_links_restaurant_status on order_delivery_links(restaurant_id, status, created_at desc);

drop trigger if exists order_delivery_links_updated_at on order_delivery_links;
create trigger order_delivery_links_updated_at before update on order_delivery_links for each row execute function set_updated_at();

alter table order_delivery_links enable row level security;

drop policy if exists "members read delivery links" on order_delivery_links;
create policy "members read delivery links" on order_delivery_links for select using (
  is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier','kitchen','waiter']::app_role[])
);

drop policy if exists "members manage delivery links" on order_delivery_links;
create policy "members manage delivery links" on order_delivery_links for all using (
  is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier','kitchen','waiter']::app_role[])
) with check (
  is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier','kitchen','waiter']::app_role[])
);

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

  if v_link.status = 'expired' or (v_link.status = 'active' and v_link.expires_at < now()) then
    update order_delivery_links
    set status = 'expired'
    where id = v_link.id
      and status = 'active';
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
            'quantity', oi.quantity,
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
begin
  if p_delivery_token is null or length(trim(p_delivery_token)) < 20 then
    raise exception 'invalid-delivery-token' using errcode = '22023';
  end if;

  select *
  into v_link
  from order_delivery_links
  where delivery_token = p_delivery_token
  for update;

  if not found then
    raise exception 'delivery-link-not-found' using errcode = 'P0002';
  end if;

  if v_link.status in ('cancelled', 'expired') or v_link.expires_at < v_now then
    update order_delivery_links
    set status = case when status = 'active' then 'expired' else status end
    where id = v_link.id;
    raise exception 'delivery-link-expired' using errcode = '22023';
  end if;

  select *
  into v_order
  from orders
  where id = v_link.order_id
  for update;

  if not found or v_order.order_type <> 'delivery' or v_order.status = 'cancelled' then
    raise exception 'order-not-deliverable' using errcode = '22023';
  end if;

  update orders
  set
    status = 'delivered',
    delivered_at = coalesce(delivered_at, v_now)
  where id = v_order.id;

  update order_delivery_links
  set
    status = 'delivered',
    delivered_at = coalesce(delivered_at, v_now)
  where id = v_link.id;

  return jsonb_build_object(
    'order_id', v_order.id,
    'restaurant_id', v_order.restaurant_id,
    'status', 'delivered',
    'delivered_at', v_now
  );
end;
$$;

grant execute on function get_delivery_order(text) to anon, authenticated;
grant execute on function mark_delivery_order_delivered(text) to anon, authenticated;
