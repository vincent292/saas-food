-- A payment tender is the physical amount handed to the cashier.  It is
-- intentionally separate from cash_movements: the movement remains the
-- accounting amount (the order total), while this table preserves the
-- received amount and change for audits.
create table if not exists cash_payment_tenders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  cash_session_id uuid references cash_sessions(id) on delete set null,
  order_id uuid references orders(id) on delete set null,
  table_id uuid references tables(id) on delete set null,
  payment_method payment_method_type not null,
  amount_due numeric(12,2) not null check (amount_due >= 0),
  amount_received numeric(12,2),
  change_given numeric(12,2),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (
    (payment_method <> 'cash' and amount_received is null and change_given is null)
    or (payment_method = 'cash' and amount_received >= amount_due and change_given = amount_received - amount_due)
  )
);

create index if not exists idx_cash_payment_tenders_restaurant
  on cash_payment_tenders(restaurant_id, created_at desc);

alter table cash_payment_tenders enable row level security;

create policy "cash roles manage payment tenders" on cash_payment_tenders
  for all
  using (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier']::app_role[]))
  with check (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier']::app_role[]));

-- Versioned wrappers retain the existing, proven inventory/accounting RPCs
-- while making cash tender validation transactional.  Raising an exception
-- rolls back the order and cash movement created by the underlying function.
create or replace function create_pos_sale_with_tender(
  p_restaurant_id uuid,
  p_order_number text,
  p_customer_name text,
  p_customer_phone text default null,
  p_order_origin order_origin default 'pos_counter',
  p_order_type order_type default 'pos',
  p_payment_method payment_method_type default 'cash',
  p_cash_received numeric default null,
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
  v_order_id uuid;
  v_total numeric;
  v_session_id uuid;
begin
  if p_order_type not in ('pos', 'pickup') then
    raise exception 'invalid-pos-order-type' using errcode = '22023';
  end if;

  v_order_id := create_pos_sale_with_cash_movement(
    p_restaurant_id, p_order_number, p_customer_name, p_customer_phone,
    p_order_origin, p_payment_method, p_receipt_url, p_receipt_reference, p_items
  );

  select total into v_total from orders where id = v_order_id for update;
  if p_payment_method = 'cash' and (p_cash_received is null or p_cash_received < v_total) then
    raise exception 'insufficient-cash-received' using errcode = '22023';
  end if;

  update orders set order_type = p_order_type where id = v_order_id;
  select cash_session_id into v_session_id
  from cash_movements
  where order_id = v_order_id and type = 'sale'
  order by created_at desc
  limit 1;

  insert into cash_payment_tenders (
    restaurant_id, cash_session_id, order_id, payment_method,
    amount_due, amount_received, change_given, created_by
  ) values (
    p_restaurant_id, v_session_id, v_order_id, p_payment_method, v_total,
    case when p_payment_method = 'cash' then p_cash_received else null end,
    case when p_payment_method = 'cash' then p_cash_received - v_total else null end,
    auth.uid()
  );
  return v_order_id;
end;
$$;

create or replace function settle_table_with_tender(
  p_restaurant_id uuid,
  p_table_id uuid,
  p_payment_method payment_method_type,
  p_cash_received numeric default null,
  p_receipt_url text default null,
  p_receipt_reference text default null
)
returns table (table_id uuid, settled_order_count integer, charged_order_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_due numeric;
  v_session_id uuid;
begin
  select coalesce(sum(total), 0) into v_due
  from orders
  where restaurant_id = p_restaurant_id and table_id = p_table_id
    and status in ('pending', 'accepted', 'preparing', 'ready')
    and payment_status <> 'paid';

  if p_payment_method = 'cash' and v_due > 0 and (p_cash_received is null or p_cash_received < v_due) then
    raise exception 'insufficient-cash-received' using errcode = '22023';
  end if;

  return query select * from settle_table_with_cash_movements(
    p_restaurant_id, p_table_id, p_payment_method, p_receipt_url, p_receipt_reference
  );

  select cash_session_id into v_session_id
  from cash_movements
  where restaurant_id = p_restaurant_id and type = 'sale'
  order by created_at desc
  limit 1;
  insert into cash_payment_tenders (
    restaurant_id, cash_session_id, table_id, payment_method,
    amount_due, amount_received, change_given, created_by
  ) values (
    p_restaurant_id, v_session_id, p_table_id, p_payment_method, v_due,
    case when p_payment_method = 'cash' then p_cash_received else null end,
    case when p_payment_method = 'cash' then p_cash_received - v_due else null end,
    auth.uid()
  );
end;
$$;

create or replace function record_cash_payment_tender(
  p_restaurant_id uuid,
  p_order_id uuid default null,
  p_table_id uuid default null,
  p_payment_method payment_method_type default 'cash',
  p_amount_due numeric default 0,
  p_cash_received numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_session_id uuid;
begin
  if auth.uid() is null or not (is_superadmin() or has_restaurant_role(p_restaurant_id, array['restaurant_admin','cashier']::app_role[])) then
    raise exception 'cash access denied' using errcode = '42501';
  end if;
  if p_payment_method = 'cash' and (p_cash_received is null or p_cash_received < p_amount_due) then
    raise exception 'insufficient-cash-received' using errcode = '22023';
  end if;
  select id into v_session_id from cash_sessions
  where restaurant_id = p_restaurant_id and status = 'open'
  order by opened_at desc limit 1;
  insert into cash_payment_tenders (
    restaurant_id, cash_session_id, order_id, table_id, payment_method,
    amount_due, amount_received, change_given, created_by
  ) values (
    p_restaurant_id, v_session_id, p_order_id, p_table_id, p_payment_method,
    p_amount_due,
    case when p_payment_method = 'cash' then p_cash_received else null end,
    case when p_payment_method = 'cash' then p_cash_received - p_amount_due else null end,
    auth.uid()
  ) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function create_pos_sale_with_tender(uuid, text, text, text, order_origin, order_type, payment_method_type, numeric, text, text, jsonb) from public, anon;
grant execute on function create_pos_sale_with_tender(uuid, text, text, text, order_origin, order_type, payment_method_type, numeric, text, text, jsonb) to authenticated;
revoke all on function settle_table_with_tender(uuid, uuid, payment_method_type, numeric, text, text) from public, anon;
grant execute on function settle_table_with_tender(uuid, uuid, payment_method_type, numeric, text, text) to authenticated;
revoke all on function record_cash_payment_tender(uuid, uuid, uuid, payment_method_type, numeric, numeric) from public, anon;
grant execute on function record_cash_payment_tender(uuid, uuid, uuid, payment_method_type, numeric, numeric) to authenticated;
