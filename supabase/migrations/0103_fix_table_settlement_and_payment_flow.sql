-- Fix the table settlement query after 0102 introduced an output column named
-- table_id. Every table/order reference is qualified so PostgreSQL never has
-- to choose between the output parameter and the orders column.
--
-- Charging a table order must not approve it for preparation. Approval and
-- payment are independent events for table service.
create or replace function approve_table_order_for_preparation(
  p_restaurant_id uuid,
  p_order_id uuid
)
returns table (
  order_id uuid,
  resulting_status order_status,
  changed_at timestamptz,
  status_changed boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order orders%rowtype;
  v_now timestamptz := now();
begin
  if auth.uid() is null or not (
    is_superadmin()
    or has_restaurant_role(p_restaurant_id, array['restaurant_admin','cashier','kitchen','waiter']::app_role[])
  ) then
    raise exception 'restaurant access denied' using errcode = '42501';
  end if;

  select restaurant_order.* into v_order
  from orders as restaurant_order
  where restaurant_order.restaurant_id = p_restaurant_id
    and restaurant_order.id = p_order_id
  for update;

  if not found then
    raise exception 'order-not-found' using errcode = 'P0002';
  end if;

  if v_order.order_type <> 'table' then
    raise exception 'invalid-table-order' using errcode = '22023';
  end if;

  if v_order.status = 'pending' then
    update orders as restaurant_order
    set status = 'accepted',
        accepted_at = coalesce(restaurant_order.accepted_at, v_now),
        cancellation_reason = null
    where restaurant_order.id = v_order.id;

    -- Approval used to charge immediately, which also consumed inventory.
    -- Preserve that inventory timing while leaving payment pending.
    perform apply_order_inventory_usage(v_order.id);

    return query select v_order.id, 'accepted'::order_status, v_now, true;
    return;
  end if;

  if v_order.status in ('accepted', 'preparing', 'ready') then
    return query select v_order.id, v_order.status, coalesce(v_order.accepted_at, v_now), false;
    return;
  end if;

  raise exception 'invalid-order-transition' using errcode = '22023';
end;
$$;

revoke all on function approve_table_order_for_preparation(uuid, uuid) from public, anon;
grant execute on function approve_table_order_for_preparation(uuid, uuid) to authenticated;

create or replace function charge_order_with_cash_movement(
  p_restaurant_id uuid,
  p_order_id uuid,
  p_payment_method payment_method_type,
  p_receipt_url text default null,
  p_receipt_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_order orders%rowtype;
  v_now timestamptz := now();
begin
  if auth.uid() is null or not (is_superadmin() or has_restaurant_role(p_restaurant_id, array['restaurant_admin','cashier']::app_role[])) then
    raise exception 'cash access denied' using errcode = '42501';
  end if;

  select cash_session.id into v_session_id
  from cash_sessions as cash_session
  where cash_session.restaurant_id = p_restaurant_id and cash_session.status = 'open'
  order by cash_session.opened_at desc
  limit 1
  for update;

  if not found then
    raise exception 'no-open-session' using errcode = 'P0002';
  end if;

  select restaurant_order.* into v_order
  from orders as restaurant_order
  where restaurant_order.restaurant_id = p_restaurant_id
    and restaurant_order.id = p_order_id
  for update;

  if not found then
    raise exception 'order-not-found' using errcode = 'P0002';
  end if;

  if v_order.status = 'cancelled' then
    raise exception 'order-cancelled' using errcode = '22023';
  end if;

  if v_order.payment_status = 'paid' then
    return v_order.id;
  end if;

  if v_order.status not in ('pending', 'accepted', 'preparing', 'ready') then
    raise exception 'invalid-order-state' using errcode = '22023';
  end if;

  if p_payment_method = 'qr'
    and v_order.order_type <> 'table'
    and coalesce(v_order.payment_receipt_url, p_receipt_url, '') = ''
    and coalesce(v_order.payment_receipt_reference, p_receipt_reference, '') = '' then
    raise exception 'receipt-required' using errcode = '22023';
  end if;

  update orders as restaurant_order
  set payment_status = 'paid',
      payment_method = p_payment_method,
      payment_receipt_url = coalesce(p_receipt_url, restaurant_order.payment_receipt_url),
      payment_receipt_uploaded_at = case when p_receipt_url is not null then v_now else restaurant_order.payment_receipt_uploaded_at end,
      payment_receipt_reference = coalesce(nullif(p_receipt_reference, ''), restaurant_order.payment_receipt_reference),
      payment_verified_at = v_now,
      status = case
        when v_order.order_type <> 'table' and v_order.status = 'pending' then 'accepted'
        else v_order.status
      end,
      accepted_at = case
        when v_order.order_type <> 'table' and v_order.status = 'pending' then coalesce(restaurant_order.accepted_at, v_now)
        else restaurant_order.accepted_at
      end,
      cancellation_reason = null
  where restaurant_order.id = v_order.id;

  insert into cash_movements (restaurant_id, cash_session_id, order_id, type, payment_method, amount, description, created_by)
  values (p_restaurant_id, v_session_id, v_order.id, 'sale', p_payment_method, v_order.total, 'Cobro de pedido ' || v_order.order_number, auth.uid());

  perform apply_order_inventory_usage(v_order.id);

  return v_order.id;
end;
$$;

revoke all on function charge_order_with_cash_movement(uuid, uuid, payment_method_type, text, text) from public, anon;
grant execute on function charge_order_with_cash_movement(uuid, uuid, payment_method_type, text, text) to authenticated;

create or replace function settle_table_with_cash_movements(
  p_restaurant_id uuid,
  p_table_id uuid,
  p_payment_method payment_method_type,
  p_receipt_url text default null,
  p_receipt_reference text default null
)
returns table (table_id uuid, settled_order_count integer, charged_order_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table tables%rowtype;
  v_order orders%rowtype;
  v_current_status order_status;
  v_now timestamptz := now();
  v_settled_count integer := 0;
  v_charged_count integer := 0;
begin
  if auth.uid() is null or not (is_superadmin() or has_restaurant_role(p_restaurant_id, array['restaurant_admin','cashier']::app_role[])) then
    raise exception 'cash access denied' using errcode = '42501';
  end if;

  select restaurant_table.* into v_table
  from tables as restaurant_table
  where restaurant_table.id = p_table_id
    and restaurant_table.restaurant_id = p_restaurant_id
    and restaurant_table.is_active = true
  for update;

  if not found then
    raise exception 'table-not-found' using errcode = 'P0002';
  end if;

  for v_order in
    select restaurant_order.*
    from orders as restaurant_order
    where restaurant_order.restaurant_id = p_restaurant_id
      and restaurant_order.table_id = p_table_id
      and restaurant_order.status in ('pending', 'accepted', 'preparing', 'ready')
    order by restaurant_order.created_at, restaurant_order.id
    for update
  loop
    v_settled_count := v_settled_count + 1;

    -- QR payments that were already reviewed are skipped. Only the remaining
    -- unpaid orders are charged with the method selected at table close.
    if v_order.payment_status <> 'paid' then
      perform charge_order_with_cash_movement(
        p_restaurant_id,
        v_order.id,
        p_payment_method,
        p_receipt_url,
        p_receipt_reference
      );
      v_charged_count := v_charged_count + 1;
    end if;

    select restaurant_order.status into v_current_status
    from orders as restaurant_order
    where restaurant_order.id = v_order.id;

    if v_current_status = 'pending' then
      update orders as restaurant_order
      set status = 'accepted', accepted_at = coalesce(restaurant_order.accepted_at, v_now)
      where restaurant_order.id = v_order.id;
      v_current_status := 'accepted';
    end if;

    if v_current_status in ('accepted', 'preparing') then
      update orders as restaurant_order
      set status = 'ready',
          accepted_at = coalesce(restaurant_order.accepted_at, v_now),
          ready_at = coalesce(restaurant_order.ready_at, v_now)
      where restaurant_order.id = v_order.id;
      v_current_status := 'ready';
    end if;

    if v_current_status = 'ready' then
      update orders as restaurant_order
      set status = 'delivered',
          delivered_at = coalesce(restaurant_order.delivered_at, v_now)
      where restaurant_order.id = v_order.id;
    end if;
  end loop;

  update tables as restaurant_table
  set status = 'available'
  where restaurant_table.id = v_table.id;

  return query select v_table.id, v_settled_count, v_charged_count;
end;
$$;

revoke all on function settle_table_with_cash_movements(uuid, uuid, payment_method_type, text, text) from public, anon;
grant execute on function settle_table_with_cash_movements(uuid, uuid, payment_method_type, text, text) to authenticated;
