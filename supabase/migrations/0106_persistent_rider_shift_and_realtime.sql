-- A rider remains eligible after opening the shift even if the phone sleeps.
-- Realtime refreshes the foreground UI; Expo push notifications wake the rider
-- when the app is backgrounded. A rider may only hold one active delivery across
-- every restaurant membership linked to the same account.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'rider_delivery_offers'
     )
  then
    alter publication supabase_realtime add table public.rider_delivery_offers;
  end if;
end
$$;

drop policy if exists "riders read own delivery links" on public.order_delivery_links;
create policy "riders read own delivery links"
  on public.order_delivery_links
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.restaurant_riders rr
      where rr.id = order_delivery_links.restaurant_rider_id
        and rr.rider_user_id = auth.uid()
    )
  );

grant select on public.order_delivery_links to authenticated;

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
  v_rider_user_id uuid;
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

  select rr.rider_user_id
    into v_rider_user_id
    from restaurant_riders rr
   where rr.id = p_restaurant_rider_id;

  if not found then
    status := 'rider-not-found';
    link_id := null;
    return next;
    return;
  end if;

  -- Serialize claims for the same person even when they belong to multiple
  -- restaurants and the requests arrive at the same time.
  perform pg_advisory_xact_lock(
    hashtextextended(coalesce(v_rider_user_id, p_restaurant_rider_id)::text, 0)
  );

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
  end if;

  if exists (
    select 1
      from order_delivery_links busy_link
      join restaurant_riders busy_rider
        on busy_rider.id = busy_link.restaurant_rider_id
     where busy_link.order_id <> p_order_id
       and busy_link.status in ('active', 'arrived')
       and busy_link.expires_at > v_now
       and (
         (v_rider_user_id is not null and busy_rider.rider_user_id = v_rider_user_id)
         or (v_rider_user_id is null and busy_rider.id = p_restaurant_rider_id)
       )
  ) then
    status := 'rider-busy';
    link_id := null;
    return next;
    return;
  end if;

  if v_link.id is not null then
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
