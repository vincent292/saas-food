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

grant execute on function charge_order_with_cash_movement(uuid, uuid, payment_method_type, text, text) to authenticated;
