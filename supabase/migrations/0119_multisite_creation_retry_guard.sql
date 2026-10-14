create or replace function create_public_multisite_order_transaction(
  p_request_id uuid,
  p_order jsonb,
  p_children jsonb
)
returns table (id uuid, tracking_token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_token text;
  v_child jsonb;
  v_child_order_id uuid;
  v_restaurant_id uuid;
  v_child_subtotal numeric(12, 2);
  v_items_total numeric(12, 2);
  v_parent_subtotal numeric(12, 2);
  v_delivery_fee numeric(12, 2);
  v_total numeric(12, 2);
  v_position integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service-role-required' using errcode = '42501';
  end if;

  if p_request_id is null or jsonb_typeof(p_order) <> 'object' or jsonb_typeof(p_children) <> 'array' then
    raise exception 'invalid-multisite-order' using errcode = '22023';
  end if;

  if jsonb_array_length(p_children) < 2 or jsonb_array_length(p_children) > 3 then
    raise exception 'invalid-multisite-children' using errcode = '22023';
  end if;

  -- Serialize retries of the same request across database connections.
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));

  select existing.id, existing.tracking_token into v_order_id, v_token
    from multisite_orders existing
   where existing.public_request_id = p_request_id;
  if v_order_id is not null then
    return query select v_order_id, v_token;
    return;
  end if;

  v_parent_subtotal := round(coalesce((p_order->>'subtotal')::numeric, 0), 2);
  v_delivery_fee := round(coalesce((p_order->>'delivery_fee')::numeric, 0), 2);
  v_total := round(coalesce((p_order->>'total')::numeric, 0), 2);
  if v_parent_subtotal < 0 or v_delivery_fee < 0 or v_total <> round(v_parent_subtotal + v_delivery_fee, 2) then
    raise exception 'invalid-multisite-total' using errcode = '22023';
  end if;

  if coalesce(p_order->>'customer_name', '') = ''
     or coalesce(p_order->>'customer_address', '') = ''
     or nullif(p_order->>'delivery_latitude', '') is null
     or nullif(p_order->>'delivery_longitude', '') is null
     or p_order->>'payment_method' <> 'cash' then
    raise exception 'invalid-multisite-customer' using errcode = '22023';
  end if;

  insert into multisite_orders (
    public_request_id, customer_name, customer_phone, customer_email,
    customer_address, delivery_address_detail, delivery_latitude, delivery_longitude, delivery_maps_url,
    payment_method, subtotal, delivery_fee, total,
    rider_fee_suggested, rider_fee_minimum, rider_fee_maximum, route_plan, notes
  ) values (
    p_request_id, p_order->>'customer_name', nullif(p_order->>'customer_phone', ''), nullif(p_order->>'customer_email', ''),
    p_order->>'customer_address', nullif(p_order->>'delivery_address_detail', ''),
    (p_order->>'delivery_latitude')::numeric, (p_order->>'delivery_longitude')::numeric, nullif(p_order->>'delivery_maps_url', ''),
    'cash', v_parent_subtotal, v_delivery_fee, v_total,
    round(coalesce((p_order->>'rider_fee_suggested')::numeric, v_delivery_fee), 2),
    round(coalesce((p_order->>'rider_fee_minimum')::numeric, v_delivery_fee), 2),
    round(coalesce((p_order->>'rider_fee_maximum')::numeric, v_delivery_fee), 2),
    coalesce(p_order->'route_plan', '{}'::jsonb), nullif(p_order->>'notes', '')
  ) returning multisite_orders.id, multisite_orders.tracking_token into v_order_id, v_token;

  for v_child in select value from jsonb_array_elements(p_children)
  loop
    v_restaurant_id := (v_child->>'restaurant_id')::uuid;
    v_position := (v_child->>'pickup_position')::integer;
    if v_restaurant_id is null or v_position is null or jsonb_typeof(v_child->'items') <> 'array' or jsonb_array_length(v_child->'items') = 0 then
      raise exception 'invalid-multisite-child' using errcode = '22023';
    end if;

    if not exists (
      select 1 from restaurants r
       join restaurant_settings s on s.restaurant_id = r.id
      where r.id = v_restaurant_id and r.status = 'active' and r.deleted_at is null and s.delivery_enabled is true
    ) then
      raise exception 'invalid-multisite-restaurant' using errcode = '22023';
    end if;

    if not exists (select 1 from cash_sessions cs where cs.restaurant_id = v_restaurant_id and cs.status = 'open') then
      raise exception 'no-open-cash' using errcode = 'P0002';
    end if;

    if exists (
      select 1
      from jsonb_to_recordset(v_child->'items') as item(product_id uuid, unit_price numeric, quantity integer, subtotal numeric)
      left join products p on p.id = item.product_id and p.restaurant_id = v_restaurant_id and p.is_available is true
      where p.id is null or item.quantity <= 0 or item.unit_price < 0 or item.subtotal <> round(item.unit_price * item.quantity, 2)
    ) then
      raise exception 'invalid-multisite-items' using errcode = '22023';
    end if;

    select coalesce(sum(item.subtotal), 0) into v_items_total
      from jsonb_to_recordset(v_child->'items') as item(subtotal numeric);
    v_child_subtotal := round(coalesce((v_child->>'subtotal')::numeric, 0), 2);
    if v_child_subtotal <> round(v_items_total, 2) then
      raise exception 'invalid-multisite-items-total' using errcode = '22023';
    end if;

    insert into orders (
      restaurant_id, order_number, public_request_id, customer_name, customer_phone, customer_email,
      customer_address, delivery_address_detail, delivery_latitude, delivery_longitude, delivery_maps_url,
      delivery_distance_km, requested_fulfillment_at, order_type, order_origin, status,
      payment_status, payment_method, subtotal, delivery_fee, discount_total, total, notes
    ) values (
      v_restaurant_id, v_child->>'order_number', p_request_id, p_order->>'customer_name', nullif(p_order->>'customer_phone', ''), nullif(p_order->>'customer_email', ''),
      p_order->>'customer_address', nullif(p_order->>'delivery_address_detail', ''), (p_order->>'delivery_latitude')::numeric,
      (p_order->>'delivery_longitude')::numeric, nullif(p_order->>'delivery_maps_url', ''), nullif(v_child->>'distance_to_destination_km', '')::numeric,
      case when coalesce((v_child->>'release_delay_minutes')::integer, 0) > 0 then now() + make_interval(mins => (v_child->>'release_delay_minutes')::integer) else null end,
      'delivery', 'web_checkout', 'pending', 'pending', 'cash', v_child_subtotal, 0, 0, v_child_subtotal,
      concat('Pedido multi-comercio #', left(v_order_id::text, 8), ' | Retiro ', v_position, ' de ', jsonb_array_length(p_children),
             case when coalesce((v_child->>'release_delay_minutes')::integer, 0) > 0 then concat(' | Preparar para retiro aprox. en ', v_child->>'release_delay_minutes', ' min') else '' end,
             case when nullif(v_child->>'notes', '') is not null then concat(' | ', v_child->>'notes') else '' end)
    ) returning orders.id into v_child_order_id;

    insert into order_items (order_id, product_id, product_name, variant_id, option_ids, unit_price, quantity, subtotal, notes)
    select v_child_order_id, item.product_id, item.product_name, item.variant_id,
      coalesce(array(select jsonb_array_elements_text(coalesce(item.option_ids, '[]'::jsonb))::uuid), '{}'::uuid[]),
      item.unit_price, item.quantity, item.subtotal, nullif(item.notes, '')
    from jsonb_to_recordset(v_child->'items') as item(
      product_id uuid, product_name text, variant_id uuid, option_ids jsonb, unit_price numeric, quantity integer, subtotal numeric, notes text
    );

    insert into multisite_order_children (
      multisite_order_id, restaurant_id, order_id, pickup_position, release_delay_minutes, estimated_ready_minutes, status, subtotal
    ) values (
      v_order_id, v_restaurant_id, v_child_order_id, v_position,
      coalesce((v_child->>'release_delay_minutes')::integer, 0), coalesce((v_child->>'estimated_ready_minutes')::integer, 0), 'pending', v_child_subtotal
    );
  end loop;

  if v_parent_subtotal <> (select coalesce(sum(subtotal), 0) from multisite_order_children where multisite_order_id = v_order_id) then
    raise exception 'invalid-multisite-total' using errcode = '22023';
  end if;

  return query select v_order_id, v_token;
end;
$$;

revoke all on function create_public_multisite_order_transaction(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function create_public_multisite_order_transaction(uuid, jsonb, jsonb) to service_role;

