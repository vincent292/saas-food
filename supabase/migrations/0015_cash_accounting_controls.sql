create unique index if not exists idx_cash_sessions_one_open_per_restaurant
  on cash_sessions(restaurant_id)
  where status = 'open';

create or replace function cash_expected_amount(p_cash_session_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(cs.opening_amount, 0)
    + coalesce(sum(
      case
        when cm.payment_method = 'cash' and cm.type in ('sale', 'income', 'adjustment') then cm.amount
        when cm.payment_method = 'cash' and cm.type = 'expense' then -cm.amount
        else 0
      end
    ), 0)
  from cash_sessions cs
  left join cash_movements cm
    on cm.cash_session_id = cs.id
    and cm.type not in ('opening', 'closing')
  where cs.id = p_cash_session_id
  group by cs.id, cs.opening_amount;
$$;

create or replace function open_cash_session_atomic(
  p_restaurant_id uuid,
  p_opening_amount numeric,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
begin
  if auth.uid() is null or not (is_superadmin() or has_restaurant_role(p_restaurant_id, array['restaurant_admin','cashier']::app_role[])) then
    raise exception 'cash access denied' using errcode = '42501';
  end if;

  if p_opening_amount < 0 then
    raise exception 'opening amount cannot be negative' using errcode = '22003';
  end if;

  insert into cash_sessions (restaurant_id, opened_by, opening_amount, expected_amount, notes)
  values (p_restaurant_id, auth.uid(), p_opening_amount, p_opening_amount, p_notes)
  returning id into v_session_id;

  insert into cash_movements (restaurant_id, cash_session_id, type, payment_method, amount, description, created_by)
  values (p_restaurant_id, v_session_id, 'opening', 'cash', p_opening_amount, 'Apertura de caja', auth.uid());

  return v_session_id;
exception
  when unique_violation then
    raise exception 'session-open' using errcode = '23505';
end;
$$;

create or replace function close_cash_session_atomic(
  p_restaurant_id uuid,
  p_counted_amount numeric,
  p_notes text default null
)
returns table (
  session_id uuid,
  expected_amount numeric,
  counted_amount numeric,
  difference_amount numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session cash_sessions%rowtype;
  v_expected numeric;
  v_difference numeric;
begin
  if auth.uid() is null or not (is_superadmin() or has_restaurant_role(p_restaurant_id, array['restaurant_admin','cashier']::app_role[])) then
    raise exception 'cash access denied' using errcode = '42501';
  end if;

  if p_counted_amount < 0 then
    raise exception 'counted amount cannot be negative' using errcode = '22003';
  end if;

  select *
    into v_session
    from cash_sessions
    where restaurant_id = p_restaurant_id
      and status = 'open'
    order by opened_at desc
    limit 1
    for update;

  if not found then
    raise exception 'no-open-session' using errcode = 'P0002';
  end if;

  v_expected := cash_expected_amount(v_session.id);
  v_difference := p_counted_amount - v_expected;

  update cash_sessions
    set closed_by = auth.uid(),
        status = 'closed',
        expected_amount = v_expected,
        counted_amount = p_counted_amount,
        difference_amount = v_difference,
        closed_at = now(),
        notes = coalesce(nullif(p_notes, ''), notes)
    where id = v_session.id;

  insert into cash_movements (restaurant_id, cash_session_id, type, payment_method, amount, description, created_by)
  values (p_restaurant_id, v_session.id, 'closing', 'cash', p_counted_amount, 'Cierre de caja', auth.uid());

  session_id := v_session.id;
  expected_amount := v_expected;
  counted_amount := p_counted_amount;
  difference_amount := v_difference;
  return next;
end;
$$;

create or replace function register_cash_movement_atomic(
  p_restaurant_id uuid,
  p_type cash_movement_type,
  p_payment_method payment_method_type,
  p_amount numeric,
  p_description text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_movement_id uuid;
begin
  if auth.uid() is null or not (is_superadmin() or has_restaurant_role(p_restaurant_id, array['restaurant_admin','cashier']::app_role[])) then
    raise exception 'cash access denied' using errcode = '42501';
  end if;

  if p_type not in ('expense', 'income', 'adjustment') then
    raise exception 'invalid cash movement type' using errcode = '22023';
  end if;

  if p_amount <= 0 then
    raise exception 'amount must be positive' using errcode = '22003';
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

  insert into cash_movements (restaurant_id, cash_session_id, type, payment_method, amount, description, created_by)
  values (p_restaurant_id, v_session_id, p_type, p_payment_method, p_amount, p_description, auth.uid())
  returning id into v_movement_id;

  return v_movement_id;
end;
$$;

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

  if v_order.status = 'cancelled' then
    raise exception 'order-cancelled' using errcode = '22023';
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
        status = 'accepted',
        accepted_at = coalesce(accepted_at, v_now),
        cancellation_reason = null
    where id = v_order.id;

  if v_order.payment_status <> 'paid' then
    insert into cash_movements (restaurant_id, cash_session_id, order_id, type, payment_method, amount, description, created_by)
    values (p_restaurant_id, v_session_id, v_order.id, 'sale', p_payment_method, v_order.total, 'Cobro de pedido ' || v_order.order_number, auth.uid());
  end if;

  return v_order.id;
end;
$$;

create or replace function create_pos_sale_with_cash_movement(
  p_restaurant_id uuid,
  p_order_number text,
  p_customer_name text,
  p_payment_method payment_method_type,
  p_receipt_url text default null,
  p_receipt_reference text default null,
  p_items jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_order_id uuid;
  v_total numeric;
  v_now timestamptz := now();
begin
  if auth.uid() is null or not (is_superadmin() or has_restaurant_role(p_restaurant_id, array['restaurant_admin','cashier']::app_role[])) then
    raise exception 'cash access denied' using errcode = '42501';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'invalid-pos-sale' using errcode = '22023';
  end if;

  if p_payment_method = 'qr' and coalesce(p_receipt_url, p_receipt_reference, '') = '' then
    raise exception 'receipt-required' using errcode = '22023';
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

  with cart as (
    select *
    from jsonb_to_recordset(p_items) as item(
      "productId" uuid,
      name text,
      price numeric,
      quantity integer,
      notes text
    )
  )
  select coalesce(sum(price * quantity), 0)
    into v_total
    from cart
    where price >= 0 and quantity > 0;

  if v_total <= 0 then
    raise exception 'invalid-pos-sale' using errcode = '22023';
  end if;

  if exists (
    with cart as (
      select *
      from jsonb_to_recordset(p_items) as item("productId" uuid, name text, price numeric, quantity integer, notes text)
    )
    select 1
    from cart
    left join products p on p.id = cart."productId" and p.restaurant_id = p_restaurant_id
    where p.id is null or p.is_available is not true or cart.price < 0 or cart.quantity <= 0
  ) then
    raise exception 'product-not-found' using errcode = '22023';
  end if;

  insert into orders (
    restaurant_id,
    order_number,
    customer_name,
    order_type,
    status,
    accepted_at,
    payment_status,
    payment_method,
    payment_receipt_url,
    payment_receipt_uploaded_at,
    payment_receipt_reference,
    payment_verified_at,
    subtotal,
    total
  )
  values (
    p_restaurant_id,
    p_order_number,
    nullif(p_customer_name, ''),
    'pos',
    'accepted',
    v_now,
    'paid',
    p_payment_method,
    p_receipt_url,
    case when p_receipt_url is not null then v_now else null end,
    nullif(p_receipt_reference, ''),
    v_now,
    v_total,
    v_total
  )
  returning id into v_order_id;

  insert into order_items (order_id, product_id, product_name, unit_price, quantity, subtotal, notes)
  select
    v_order_id,
    item."productId",
    coalesce(nullif(item.name, ''), p.name),
    item.price,
    item.quantity,
    item.price * item.quantity,
    nullif(item.notes, '')
  from jsonb_to_recordset(p_items) as item("productId" uuid, name text, price numeric, quantity integer, notes text)
  join products p on p.id = item."productId" and p.restaurant_id = p_restaurant_id;

  insert into cash_movements (restaurant_id, cash_session_id, order_id, type, payment_method, amount, description, created_by)
  values (p_restaurant_id, v_session_id, v_order_id, 'sale', p_payment_method, v_total, 'Venta rapida POS ' || p_order_number, auth.uid());

  return v_order_id;
end;
$$;

grant execute on function cash_expected_amount(uuid) to authenticated;
grant execute on function open_cash_session_atomic(uuid, numeric, text) to authenticated;
grant execute on function close_cash_session_atomic(uuid, numeric, text) to authenticated;
grant execute on function register_cash_movement_atomic(uuid, cash_movement_type, payment_method_type, numeric, text) to authenticated;
grant execute on function charge_order_with_cash_movement(uuid, uuid, payment_method_type, text, text) to authenticated;
grant execute on function create_pos_sale_with_cash_movement(uuid, text, text, payment_method_type, text, text, jsonb) to authenticated;
