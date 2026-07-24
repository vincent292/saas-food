create or replace function refund_order_atomic(
  p_restaurant_id uuid,
  p_order_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_order orders%rowtype;
  v_movement_id uuid;
  v_restore_inventory boolean;
begin
  if auth.uid() is null or not (
    is_superadmin()
    or has_restaurant_role(p_restaurant_id, array['restaurant_admin','cashier']::app_role[])
  ) then
    raise exception 'cash access denied' using errcode = '42501';
  end if;

  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'refund-reason-required' using errcode = '22023';
  end if;

  select id
    into v_session_id
  from cash_sessions
  where restaurant_id = p_restaurant_id
    and status = 'open'
  order by opened_at desc
  limit 1
  for update;

  if not found then
    raise exception 'no-open-session' using errcode = 'P0002';
  end if;

  select *
    into v_order
  from orders
  where restaurant_id = p_restaurant_id
    and id = p_order_id
  for update;

  if not found then
    raise exception 'order-not-found' using errcode = 'P0002';
  end if;

  if v_order.payment_status = 'refunded' then
    raise exception 'already-refunded' using errcode = '22023';
  end if;

  if v_order.payment_status <> 'paid' then
    raise exception 'order-not-paid' using errcode = '22023';
  end if;

  v_restore_inventory := v_order.status <> 'delivered';

  update orders
  set
    payment_status = 'refunded',
    status = case when status = 'delivered' then status else 'cancelled'::order_status end,
    cancelled_at = case when status = 'delivered' then cancelled_at else coalesce(cancelled_at, now()) end,
    cancellation_reason = trim(p_reason)
  where id = v_order.id;

  insert into cash_movements (
    restaurant_id,
    cash_session_id,
    order_id,
    type,
    payment_method,
    amount,
    description,
    created_by
  )
  values (
    p_restaurant_id,
    v_session_id,
    v_order.id,
    'expense',
    v_order.payment_method,
    v_order.total,
    'Reembolso de pedido ' || v_order.order_number || ': ' || trim(p_reason),
    auth.uid()
  )
  returning id into v_movement_id;

  if v_restore_inventory then
    perform reverse_order_inventory_usage(v_order.id, 'Reposicion por reembolso de pedido');
  end if;

  return v_movement_id;
end;
$$;

revoke all on function refund_order_atomic(uuid, uuid, text) from public, anon;
grant execute on function refund_order_atomic(uuid, uuid, text) to authenticated;
