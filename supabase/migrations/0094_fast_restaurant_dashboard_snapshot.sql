create or replace function get_restaurant_dashboard_snapshot(p_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cash_session_id uuid;
  v_day_start timestamptz := date_trunc('day', now() at time zone 'America/La_Paz') at time zone 'America/La_Paz';
  v_sales_total numeric := 0;
  v_pending_orders integer := 0;
  v_preparing_orders integer := 0;
  v_ready_orders integer := 0;
  v_active_tables integer := 0;
  v_products jsonb := '[]'::jsonb;
  v_low_stock jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or not (
    is_superadmin()
    or has_restaurant_role(p_restaurant_id, array['restaurant_admin','cashier','kitchen','waiter']::app_role[])
  ) then
    raise exception 'restaurant dashboard access denied' using errcode = '42501';
  end if;

  select id into v_cash_session_id
  from cash_sessions
  where restaurant_id = p_restaurant_id and status = 'open'
  order by opened_at desc
  limit 1;

  if v_cash_session_id is not null then
    select coalesce(sum(amount), 0) into v_sales_total
    from cash_movements
    where restaurant_id = p_restaurant_id
      and cash_session_id = v_cash_session_id
      and type = 'sale';
  end if;

  select
    count(*) filter (where status = 'pending'),
    count(*) filter (where status = 'preparing'),
    count(*) filter (where status = 'ready')
  into v_pending_orders, v_preparing_orders, v_ready_orders
  from orders
  where restaurant_id = p_restaurant_id and created_at >= v_day_start;

  select count(*) into v_active_tables
  from tables
  where restaurant_id = p_restaurant_id and is_active = true and status <> 'available';

  select coalesce(jsonb_agg(to_jsonb(product_row)), '[]'::jsonb) into v_products
  from (
    select id, name, price
    from products
    where restaurant_id = p_restaurant_id and is_available = true
    order by sort_order asc, created_at asc
    limit 4
  ) as product_row;

  select coalesce(jsonb_agg(to_jsonb(stock_row)), '[]'::jsonb) into v_low_stock
  from (
    select id, name, current_stock, min_stock, unit
    from inventory_items
    where restaurant_id = p_restaurant_id and is_active = true and current_stock <= min_stock
    order by (min_stock - current_stock) desc, name asc
    limit 12
  ) as stock_row;

  return jsonb_build_object(
    'sales_total', v_sales_total,
    'pending_orders', v_pending_orders,
    'preparing_orders', v_preparing_orders,
    'ready_orders', v_ready_orders,
    'active_tables', v_active_tables,
    'products', v_products,
    'low_stock', v_low_stock
  );
end;
$$;

revoke all on function get_restaurant_dashboard_snapshot(uuid) from public;
grant execute on function get_restaurant_dashboard_snapshot(uuid) to authenticated;
