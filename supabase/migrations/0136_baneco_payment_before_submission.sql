-- A durable payment reservation is not an operational restaurant order.
-- Retain its UUID/capability and bank reconciliation, but withhold it from
-- staff, kitchen, queue forecasts, dashboards and notifications until paid.
alter table public.orders add column bank_checkout_hold boolean not null default false;
update public.orders set bank_checkout_hold=true where bank_payment_required and payment_status='pending' and status='pending'
  and order_origin in ('web_checkout','table_qr','phone_whatsapp') and group_order_session_id is null and bank_group_session_id is null;

create function public.guard_bank_checkout_hold() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' then
    new.bank_checkout_hold:=new.bank_payment_required and new.payment_status='pending'
      and new.order_origin in ('web_checkout','table_qr','phone_whatsapp')
      and new.group_order_session_id is null and new.bank_group_session_id is null;
  elsif old.bank_checkout_hold then
    new.bank_checkout_hold:=true;
    if new.payment_status='paid' and exists(select 1 from bank_qr_test_requests r where r.order_id=new.id
      and r.status='paid' and r.amount=new.total and r.bank_transaction_id is not distinct from new.payment_receipt_reference) then
      new.bank_checkout_hold:=false;
      if new.table_id is not null then update tables set status='occupied' where id=new.table_id and restaurant_id=new.restaurant_id;end if;
    end if;
  elsif new.bank_checkout_hold and (new.payment_status<>'pending' or not new.bank_payment_required or new.status<>'pending') then
    raise exception 'bank-payment-required';
  end if;
  return new;
end $$;
create trigger guard_bank_checkout_hold before insert or update on public.orders for each row execute function public.guard_bank_checkout_hold();
-- Restrictive policy also constrains existing permissive member/superadmin
-- policies. Private server reconciliation bypasses RLS, browser staff cannot.
create policy bank_checkout_not_operational on public.orders as restrictive for select to authenticated using(not bank_checkout_hold);
create view public.bank_visible_orders with(security_invoker=true) as select * from public.orders where not bank_checkout_hold;
revoke all on public.bank_visible_orders from public,anon,authenticated;
grant select on public.bank_visible_orders to service_role;

-- Security-definer aggregates bypass RLS: explicitly use the operational view.
do $migration$
declare target record; definition text;
begin
  for target in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname in ('get_public_order_queue_state','get_restaurant_dashboard_snapshot') loop
    definition:=regexp_replace(pg_get_functiondef(target.oid),'\m(from|join)\s+(public\.)?orders\M','\1 public.bank_visible_orders','gi');
    execute definition;
  end loop;
  definition:=pg_get_functiondef('public.create_public_multisite_order_transaction(uuid,jsonb,jsonb)'::regprocedure);
  definition:=replace(definition,'update orders set payment_method=''qr'',bank_payment_required=true,bank_auto_accept=true,requires_prepayment=true',
    'update orders set payment_method=''qr'',bank_payment_required=true,bank_auto_accept=true,requires_prepayment=true,bank_checkout_hold=true');
  execute definition;
end $migration$;

create function public.abandon_baneco_checkout(p_order uuid,p_token text) returns boolean
language plpgsql security definer set search_path=public as $$
declare o orders%rowtype;
begin
  select * into o from orders where id=p_order and tracking_token=p_token for update;
  if not found or not o.bank_checkout_hold or o.payment_status<>'pending' then return false;end if;
  if exists(select 1 from bank_qr_test_requests where order_id=o.id and status not in ('failed','cancelled')) then return false;end if;
  update orders set status='cancelled',payment_status='cancelled' where id=o.id;
  return true;
end $$;
revoke all on function public.guard_bank_checkout_hold(),public.abandon_baneco_checkout(uuid,text) from public,anon,authenticated;
grant execute on function public.abandon_baneco_checkout(uuid,text) to service_role;
