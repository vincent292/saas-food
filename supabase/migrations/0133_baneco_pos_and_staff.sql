-- Convert an existing unpaid order only through an authenticated cashier. This
-- also supports table orders: confirmation pays the order, never frees a table.
create function public.prepare_baneco_staff_order(p_restaurant uuid,p_order uuid,p_actor uuid) returns text
language plpgsql security definer set search_path=public as $$
declare o orders%rowtype; connection uuid;
begin
  if not exists(select 1 from profiles where id=p_actor and global_role='superadmin') and not exists(
    select 1 from restaurant_memberships where user_id=p_actor and restaurant_id=p_restaurant
      and is_active and role in ('restaurant_admin','cashier')) then raise exception 'bank-forbidden' using errcode='42501'; end if;
  connection:=resolve_baneco_collection(p_restaurant);
  perform 1 from bank_qr_connections where id=connection and active and orders_enabled and check_result='ok' for update;
  if not found then raise exception 'bank-connection-unavailable'; end if;
  select * into o from orders where id=p_order and restaurant_id=p_restaurant for update;
  if not found or o.bank_group_session_id is not null or o.group_order_session_id is not null
    or exists(select 1 from multisite_order_children where order_id=o.id) then raise exception 'bank-order-ineligible'; end if;
  if o.payment_status='paid' then return o.tracking_token; end if;
  if o.payment_status<>'pending' or o.status in ('cancelled','delivered') or o.total not between .01 and 50000
    or coalesce(o.payment_receipt_url,'')<>'' or coalesce(o.payment_receipt_reference,'')<>'' then raise exception 'bank-order-ineligible'; end if;
  update orders set payment_method='qr',bank_payment_required=true,bank_auto_accept=true where id=o.id;
  return o.tracking_token;
end $$;
revoke all on function public.prepare_baneco_staff_order(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.prepare_baneco_staff_order(uuid,uuid,uuid) to service_role;

-- Reuse the established DB catalog/variant/extra pricing, without a cash sale,
-- stock consumption or accepted status before the bank confirms payment.
alter function public.create_pos_sale_with_cash_movement(uuid,text,text,text,order_origin,payment_method_type,text,text,jsonb)
  rename to create_pos_sale_with_cash_movement_before_bank;
revoke all on function public.create_pos_sale_with_cash_movement_before_bank(uuid,text,text,text,order_origin,payment_method_type,text,text,jsonb) from public,anon,authenticated,service_role;
do $migration$
declare definition text; fragment text; patched text;
begin
  definition:=pg_get_functiondef('public.create_pos_sale_with_cash_movement_before_bank(uuid,text,text,text,order_origin,payment_method_type,text,text,jsonb)'::regprocedure);
  definition:=replace(definition,'create_pos_sale_with_cash_movement_before_bank','create_baneco_pos_draft');
  fragment:='if p_payment_method = ''qr'' and coalesce(p_receipt_url, p_receipt_reference, '''') = '''' then
    raise exception ''receipt-required'' using errcode = ''22023'';
  end if;';
  patched:=replace(definition,fragment,'if p_payment_method <> ''qr'' or resolve_baneco_collection(p_restaurant_id) is null then raise exception ''bank-connection-unavailable''; end if;
  if coalesce(p_receipt_url,'''')<>'''' or coalesce(p_receipt_reference,'''')<>'''' then raise exception ''bank-payment-required''; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_restaurant_id::text||'':''||p_order_number,0));
  select id into v_order_id from orders where restaurant_id=p_restaurant_id and order_number=p_order_number;
  if found then return v_order_id; end if;');
  if patched=definition then raise exception 'bank-pos-receipt-definition-changed'; end if;definition:=patched;
  fragment:='''accepted'',
    v_now,
    ''paid'',
    p_payment_method,';
  patched:=replace(definition,fragment,'''pending'',
    null,
    ''pending'',
    p_payment_method,');
  if patched=definition then raise exception 'bank-pos-status-definition-changed'; end if;definition:=patched;
  fragment:='insert into cash_movements (restaurant_id, cash_session_id, order_id, type, payment_method, amount, description, created_by)
  values (p_restaurant_id, v_session_id, v_order_id, ''sale'', p_payment_method, v_total, ''Venta rapida POS '' || p_order_number, auth.uid());';
  patched:=replace(definition,fragment,'update orders set bank_payment_required=true,bank_auto_accept=true,requires_prepayment=true,payment_verified_at=null where id=v_order_id;');
  if patched=definition then raise exception 'bank-pos-cash-definition-changed'; end if;execute patched;
end $migration$;
revoke all on function public.create_baneco_pos_draft(uuid,text,text,text,order_origin,payment_method_type,text,text,jsonb) from public,anon,authenticated,service_role;
create function public.create_pos_sale_with_cash_movement(p_restaurant_id uuid,p_order_number text,p_customer_name text,p_customer_phone text default null,
  p_order_origin order_origin default 'pos_counter',p_payment_method payment_method_type default 'cash',p_receipt_url text default null,p_receipt_reference text default null,p_items jsonb default '[]') returns uuid
language plpgsql security definer set search_path=public as $$
begin
  if p_payment_method='qr' then
    return create_baneco_pos_draft(p_restaurant_id,p_order_number,p_customer_name,p_customer_phone,p_order_origin,p_payment_method,p_receipt_url,p_receipt_reference,p_items);
  end if;
  return create_pos_sale_with_cash_movement_before_bank(p_restaurant_id,p_order_number,p_customer_name,p_customer_phone,p_order_origin,p_payment_method,p_receipt_url,p_receipt_reference,p_items);
end $$;
revoke all on function public.create_pos_sale_with_cash_movement(uuid,text,text,text,order_origin,payment_method_type,text,text,jsonb) from public,anon;
grant execute on function public.create_pos_sale_with_cash_movement(uuid,text,text,text,order_origin,payment_method_type,text,text,jsonb) to authenticated;
-- POS tender remains unpaid and does not invent a cash movement for a QR draft.
do $migration$
declare definition text; patched text;
begin
  definition:=pg_get_functiondef('public.create_pos_sale_with_tender(uuid,text,text,text,order_origin,order_type,payment_method_type,numeric,text,text,jsonb)'::regprocedure);
  patched:=replace(definition,'select total into v_total from orders where id = v_order_id for update;',
    'if p_payment_method=''qr'' then update orders set order_type=p_order_type where id=v_order_id; return v_order_id; end if;
  select total into v_total from orders where id = v_order_id for update;');
  if patched=definition then raise exception 'bank-pos-tender-definition-changed'; end if;execute patched;
end $migration$;

create function public.guard_baneco_manual_settlement() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' then
    if new.payment_method='qr' then
      if new.payment_status<>'pending' or new.status<>'pending' or coalesce(new.payment_receipt_url,'')<>''
        or coalesce(new.payment_receipt_reference,'')<>'' then raise exception 'bank-payment-required'; end if;
      new.bank_payment_required:=true;new.bank_auto_accept:=true;new.requires_prepayment:=true;
    end if;
    return new;
  end if;
  if old.payment_status<>'paid' and new.payment_status='paid' and new.payment_method='qr'
    and new.bank_group_session_id is null and not exists(select 1 from bank_qr_test_requests r
      where r.order_id=new.id and r.status='paid' and r.amount=new.total and r.bank_transaction_id is not distinct from new.payment_receipt_reference) then
    raise exception 'bank-payment-required';
  end if;
  if old.payment_status<>'paid' and (new.total is distinct from old.total or new.payment_method is distinct from old.payment_method
    or new.status='cancelled' or new.payment_status='cancelled') and exists(
    select 1 from bank_qr_test_requests where order_id=old.id and status not in ('failed','cancelled')) then
    raise exception 'bank-cancel-qr-first';
  end if;
  return new;
end $$;
create trigger guard_baneco_manual_settlement before insert or update on public.orders for each row execute function public.guard_baneco_manual_settlement();
revoke all on function public.guard_baneco_manual_settlement() from public,anon,authenticated,service_role;
