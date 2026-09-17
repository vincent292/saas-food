-- Each branch starts with two waiter seats. The platform can change the seat
-- count per branch without removing any existing staff account.
alter table restaurants
  add column if not exists waiter_limit integer not null default 2
  check (waiter_limit >= 0 and waiter_limit <= 100);

update restaurants
set waiter_limit = 2
where waiter_limit is null;

-- Table QR orders may be paid at the end of the meal. Unlike delivery QR
-- prepayments, a receipt/reference is optional when closing a table at cash.
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

  select id into v_session_id
  from cash_sessions
  where restaurant_id = p_restaurant_id and status = 'open'
  order by opened_at desc
  limit 1
  for update;

  if not found then
    raise exception 'no-open-session' using errcode = 'P0002';
  end if;

  select * into v_order
  from orders
  where restaurant_id = p_restaurant_id and id = p_order_id
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

  update orders
    set payment_status = 'paid',
        payment_method = p_payment_method,
        payment_receipt_url = coalesce(p_receipt_url, payment_receipt_url),
        payment_receipt_uploaded_at = case when p_receipt_url is not null then v_now else payment_receipt_uploaded_at end,
        payment_receipt_reference = coalesce(nullif(p_receipt_reference, ''), payment_receipt_reference),
        payment_verified_at = v_now,
        status = case when v_order.status = 'pending' then 'accepted' else v_order.status end,
        accepted_at = case when v_order.status = 'pending' then coalesce(accepted_at, v_now) else accepted_at end,
        cancellation_reason = null
    where id = v_order.id;

  insert into cash_movements (restaurant_id, cash_session_id, order_id, type, payment_method, amount, description, created_by)
  values (p_restaurant_id, v_session_id, v_order.id, 'sale', p_payment_method, v_order.total, 'Cobro de pedido ' || v_order.order_number, auth.uid());

  perform apply_order_inventory_usage(v_order.id);

  return v_order.id;
end;
$$;

-- Closing a table settles every active order on it as one cash operation, then
-- releases the table. This prevents a partial close where only some dishes are
-- charged while the table appears available.
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

  select * into v_table
  from tables
  where id = p_table_id
    and restaurant_id = p_restaurant_id
    and is_active = true
  for update;

  if not found then
    raise exception 'table-not-found' using errcode = 'P0002';
  end if;

  for v_order in
    select *
    from orders
    where restaurant_id = p_restaurant_id
      and table_id = p_table_id
      and status in ('pending', 'accepted', 'preparing', 'ready')
    order by created_at, id
    for update
  loop
    v_settled_count := v_settled_count + 1;

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

    select status into v_current_status
    from orders
    where id = v_order.id;

    -- Preserve the normal status transition chain so the order transition
    -- trigger continues to protect every other operational flow.
    if v_current_status = 'pending' then
      update orders
      set status = 'accepted', accepted_at = coalesce(accepted_at, v_now)
      where id = v_order.id;
      v_current_status := 'accepted';
    end if;

    if v_current_status in ('accepted', 'preparing') then
      update orders
      set status = 'ready',
          accepted_at = coalesce(accepted_at, v_now),
          ready_at = coalesce(ready_at, v_now)
      where id = v_order.id;
      v_current_status := 'ready';
    end if;

    if v_current_status = 'ready' then
      update orders
      set status = 'delivered',
          delivered_at = coalesce(delivered_at, v_now)
      where id = v_order.id;
    end if;
  end loop;

  update tables
  set status = 'available'
  where id = v_table.id;

  return query select v_table.id, v_settled_count, v_charged_count;
end;
$$;

revoke all on function settle_table_with_cash_movements(uuid, uuid, payment_method_type, text, text) from public, anon;
grant execute on function settle_table_with_cash_movements(uuid, uuid, payment_method_type, text, text) to authenticated;
