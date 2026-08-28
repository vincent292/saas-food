create or replace function update_operational_order_status(
  p_restaurant_id uuid,
  p_order_id uuid,
  p_expected_status order_status,
  p_next_status order_status
)
returns table (
  order_id uuid,
  resulting_order_type order_type,
  resulting_status order_status,
  changed_at timestamptz,
  status_changed boolean
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;

  if not is_superadmin() and not exists (
    select 1
    from restaurants
    where id = p_restaurant_id and status = 'active'
  ) then
    raise exception 'restaurant-access-denied' using errcode = '42501';
  end if;

  if not (
    (p_expected_status = 'accepted' and p_next_status in ('preparing', 'ready'))
    or (p_expected_status = 'preparing' and p_next_status = 'ready')
    or (p_expected_status = 'ready' and p_next_status = 'delivered')
  ) then
    raise exception 'invalid-order-transition' using errcode = '22023';
  end if;

  return query
  update orders as target
  set
    status = p_next_status,
    preparing_at = case when p_next_status = 'preparing' then v_now else target.preparing_at end,
    ready_at = case when p_next_status = 'ready' then v_now else target.ready_at end,
    delivered_at = case when p_next_status = 'delivered' then v_now else target.delivered_at end
  where target.id = p_order_id
    and target.restaurant_id = p_restaurant_id
    and target.status = p_expected_status
  returning target.id, target.order_type, target.status, v_now, true;

  if found then
    return;
  end if;

  return query
  select
    current_order.id,
    current_order.order_type,
    current_order.status,
    case p_next_status
      when 'preparing' then coalesce(current_order.preparing_at, current_order.updated_at)
      when 'ready' then coalesce(current_order.ready_at, current_order.updated_at)
      when 'delivered' then coalesce(current_order.delivered_at, current_order.updated_at)
      else current_order.updated_at
    end,
    false
  from orders as current_order
  where current_order.id = p_order_id
    and current_order.restaurant_id = p_restaurant_id
    and current_order.status = p_next_status;
end;
$$;

revoke all on function update_operational_order_status(uuid, uuid, order_status, order_status) from public, anon;
grant execute on function update_operational_order_status(uuid, uuid, order_status, order_status) to authenticated;
