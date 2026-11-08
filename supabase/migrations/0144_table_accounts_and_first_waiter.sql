-- Keep operational delivery separate from an explicitly closed table account.
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

  if v_order.status not in ('pending', 'accepted', 'preparing', 'ready')
    and not (v_order.order_type = 'table' and v_order.status = 'delivered' and exists(
      select 1 from table_visits v where v.id = v_order.table_visit_id and v.status = 'open'
        and v.restaurant_id = p_restaurant_id and v.table_id = v_order.table_id)) then
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
  v_visit uuid;
  v_order orders%rowtype;
  v_current_status order_status;
  v_now timestamptz := now();
  v_settled_count integer := 0;
  v_charged_count integer := 0;
begin
  if auth.uid() is null or not (is_superadmin() or has_restaurant_role(p_restaurant_id, array['restaurant_admin','cashier']::app_role[])) then
    raise exception 'cash access denied' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('table-visit:'||p_table_id::text,0));
  perform 1 from cash_sessions s where s.restaurant_id=p_restaurant_id and s.status='open' for update;
  if not found then raise exception 'no-open-session'; end if;

  select restaurant_table.* into v_table
  from tables as restaurant_table
  where restaurant_table.id = p_table_id
    and restaurant_table.restaurant_id = p_restaurant_id
    and restaurant_table.is_active = true
  for update;

  if not found then
    raise exception 'table-not-found' using errcode = 'P0002';
  end if;

  select v.id into v_visit from table_visits v
    where v.restaurant_id=p_restaurant_id and v.table_id=p_table_id and v.status='open' for update;

  for v_order in
    select restaurant_order.*
    from orders as restaurant_order
    where restaurant_order.restaurant_id = p_restaurant_id
      and restaurant_order.table_id = p_table_id
      and restaurant_order.table_visit_id = v_visit
      and restaurant_order.status <> 'cancelled'
      and restaurant_order.payment_status in ('pending','paid')
      and not restaurant_order.bank_checkout_hold and not restaurant_order.bank_schedule_hold
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

  if v_visit is not null then
    perform write_admin_audit(p_action=>'table_settled',p_entity_type=>'restaurant_table',p_entity_id=>p_table_id,
      p_restaurant_id=>p_restaurant_id,p_metadata=>jsonb_build_object('visitId',v_visit,'orderCount',v_settled_count,'chargedOrderCount',v_charged_count));
  end if;
  update table_visits v set status='closed',closed_at=v_now,closed_by=auth.uid()
    where v.id=v_visit and v.restaurant_id=p_restaurant_id and v.status='open';

  update tables as restaurant_table
  set status = 'available'
  where restaurant_table.id = v_table.id;

  return query select v_table.id, v_settled_count, v_charged_count;
end;
$$;

revoke all on function settle_table_with_cash_movements(uuid, uuid, payment_method_type, text, text) from public, anon;
grant execute on function settle_table_with_cash_movements(uuid, uuid, payment_method_type, text, text) to authenticated;
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
  if auth.uid() is null or not (is_superadmin() or has_restaurant_role(p_restaurant_id,array['restaurant_admin','cashier']::app_role[])) then
    raise exception 'cash access denied' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('table-visit:'||p_table_id::text,0));
  perform 1 from cash_sessions s where s.restaurant_id=p_restaurant_id and s.status='open' for update;
  if not found then raise exception 'no-open-session'; end if;
  perform 1 from orders o join table_visits v on v.id=o.table_visit_id
    where v.restaurant_id=p_restaurant_id and v.table_id=p_table_id and v.status='open' for update of o;
  select coalesce(sum(o.total), 0) into v_due
  from orders o
  where o.restaurant_id = p_restaurant_id and o.table_id = p_table_id
    and o.status <> 'cancelled' and o.payment_status in ('pending','paid')
    and not o.bank_checkout_hold and not o.bank_schedule_hold
    and o.table_visit_id in(select v.id from table_visits v where v.restaurant_id=p_restaurant_id and v.table_id=p_table_id and v.status='open')
    and o.payment_status <> 'paid';

  if p_payment_method='qr' and v_due>0 then raise exception 'bank-payment-required'; end if;

  if p_payment_method = 'cash' and v_due > 0 and (p_cash_received is null or p_cash_received < v_due) then
    raise exception 'insufficient-cash-received' using errcode = '22023';
  end if;

  return query select * from settle_table_with_cash_movements(
    p_restaurant_id, p_table_id, p_payment_method, p_receipt_url, p_receipt_reference
  );

  if v_due > 0 then
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
  end if;
end;
$$;

-- A stale cashier screen must never settle a newer table visit.
create function public.close_table_account(p_restaurant_id uuid,p_table_id uuid,p_visit_id uuid,
  p_payment_method payment_method_type,p_cash_received numeric default null)
returns table(table_id uuid,settled_order_count integer,charged_order_count integer)
language plpgsql security definer set search_path=public as $$
declare visit table_visits%rowtype;
begin
  if auth.uid() is null or not (is_superadmin() or has_restaurant_role(p_restaurant_id,array['restaurant_admin','cashier']::app_role[])) then
    raise exception 'cash access denied' using errcode='42501';end if;
  perform pg_advisory_xact_lock(hashtextextended('table-visit:'||p_table_id::text,0));
  select * into visit from table_visits v where v.id=p_visit_id and v.restaurant_id=p_restaurant_id and v.table_id=p_table_id;
  if not found then raise exception 'table-account-changed';end if;
  if visit.status='closed' then return query select p_table_id,0,0;return;end if;
  if visit.status<>'open' then raise exception 'table-account-changed';end if;
  return query select * from settle_table_with_tender(p_restaurant_id,p_table_id,p_payment_method,p_cash_received,null,null);
end $$;
revoke all on function public.close_table_account(uuid,uuid,uuid,payment_method_type,numeric) from public,anon;
grant execute on function public.close_table_account(uuid,uuid,uuid,payment_method_type,numeric) to authenticated;
create or replace function public.request_table_service(p_restaurant uuid,p_table uuid,p_request uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare call table_service_calls%rowtype; waiter uuid; latest timestamptz;
begin
  if p_request is null or not exists(select 1 from tables t join restaurants r on r.id=t.restaurant_id
    join restaurant_settings s on s.restaurant_id=r.id where t.id=p_table and r.id=p_restaurant and t.is_active
    and r.status='active' and r.deleted_at is null and s.table_orders_enabled) then raise exception 'table-unavailable';end if;
  if not exists(select 1 from cash_sessions where restaurant_id=p_restaurant and status='open') then raise exception 'table-service-closed';end if;
  perform pg_advisory_xact_lock(hashtextextended('table-service:'||p_table::text,0));
  update table_service_calls set status='expired' where table_id=p_table and status='pending' and created_at<now()-interval '15 minutes';
  select * into call from table_service_calls where request_id=p_request;
  if found then
    if call.restaurant_id<>p_restaurant or call.table_id<>p_table then raise exception 'table-unavailable';end if;
    return jsonb_build_object('call',to_jsonb(call),'created',false);
  end if;
  select * into call from table_service_calls where table_id=p_table and status='pending';
  if found then return jsonb_build_object('call',to_jsonb(call),'created',false);end if;
  select max(created_at) into latest from table_service_calls where table_id=p_table;
  if latest>now()-interval '2 minutes' then raise exception 'table-call-cooldown';end if;
  -- The first trusted waiter order owns this visit, even if a later waiter helps.
  select audit.actor_user_id into waiter from admin_audit_logs audit
    join orders o on o.id=audit.entity_id and o.restaurant_id=audit.restaurant_id
    join table_visits visit on visit.id=o.table_visit_id and visit.status='open'
      and visit.restaurant_id=o.restaurant_id and visit.table_id=o.table_id
    join restaurant_memberships m on m.user_id=audit.actor_user_id and m.restaurant_id=o.restaurant_id and m.is_active and m.role='waiter'
    where audit.action='waiter_order_created' and audit.restaurant_id=p_restaurant and o.table_id=p_table
    order by o.created_at,audit.created_at,audit.id limit 1;
  if waiter is null then
    select a.waiter_user_id into waiter from waiter_table_assignments a
      join restaurant_memberships m on m.user_id=a.waiter_user_id and m.restaurant_id=a.restaurant_id and m.is_active and m.role='waiter'
      where a.restaurant_id=p_restaurant and a.table_id=p_table;
  end if;
  insert into table_service_calls(restaurant_id,table_id,request_id,assigned_waiter_id)
    values(p_restaurant,p_table,p_request,waiter) returning * into call;
  return jsonb_build_object('call',to_jsonb(call),'created',true);
end $$;

do $migration$
declare definition text; patched text;
begin
  definition:=pg_get_functiondef('public.prepare_baneco_staff_order(uuid,uuid,uuid)'::regprocedure);
  patched:=replace(definition,'o.status in (''cancelled'',''delivered'')','(o.status=''cancelled'' or (o.status=''delivered'' and not (o.order_type=''table'' and exists(select 1 from table_visits v where v.id=o.table_visit_id and v.status=''open'' and v.restaurant_id=o.restaurant_id))))');
  if patched=definition then raise exception 'table-bank-prepare-definition-changed';end if;
  patched:=replace(patched,'bank_payment_required=true,bank_auto_accept=true','bank_payment_required=(o.status=''pending''),bank_auto_accept=(o.status=''pending'')');
  execute patched;
  definition:=pg_get_functiondef('public.reserve_baneco_order_qr(uuid,text)'::regprocedure);
  patched:=replace(definition,'o.status not in (''pending'',''accepted'',''preparing'',''ready'')','(o.status not in (''pending'',''accepted'',''preparing'',''ready'') and not (o.order_type=''table'' and o.status=''delivered'' and exists(select 1 from table_visits v where v.id=o.table_visit_id and v.status=''open'' and v.restaurant_id=o.restaurant_id)))');
  if patched=definition then raise exception 'table-bank-reserve-definition-changed';end if;execute patched;
end $migration$;

-- Visit changes refresh account membership even when an order's kitchen status stays unchanged.
do $$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
    and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='table_visits') then
    alter publication supabase_realtime add table public.table_visits;
  end if;
end $$;
