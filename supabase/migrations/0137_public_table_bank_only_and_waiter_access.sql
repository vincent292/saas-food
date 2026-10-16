-- Public table links cannot submit unpaid cash orders. Authenticated POS staff
-- use a server-selected pos_counter origin, with shift/assignment audit checks.
create function public.guard_public_table_bank_payment() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.order_type='table' and new.order_origin='table_qr' and new.payment_method<>'qr' then
    raise exception 'table-qr-required' using errcode='22023';
  end if;
  return new;
end $$;
create trigger guard_public_table_bank_payment before insert on public.orders
  for each row execute function public.guard_public_table_bank_payment();

-- The public reservation must not open/attach a visit before payment. Staff
-- orders still open a visit immediately; a paid public order joins the current
-- visit atomically, even when two people pay for the same table concurrently.
create or replace function public.link_table_order_to_open_visit() returns trigger
language plpgsql security definer set search_path=public as $$
declare visit uuid;
begin
  if new.order_type<>'table' or new.table_id is null or new.table_visit_id is not null or new.bank_checkout_hold then return new;end if;
  perform pg_advisory_xact_lock(hashtextextended('table-visit:'||new.table_id::text,0));
  select id into visit from table_visits where restaurant_id=new.restaurant_id and table_id=new.table_id and status='open' for update;
  if visit is null then
    insert into table_visits(restaurant_id,table_id,opened_by) values(new.restaurant_id,new.table_id,auth.uid()) returning id into visit;
  end if;
  new.table_visit_id:=visit;
  return new;
end $$;
drop trigger if exists orders_link_table_visit on public.orders;
create trigger orders_link_table_visit before insert or update of payment_status on public.orders
  for each row execute function public.link_table_order_to_open_visit();

-- Read/generate/cancel permission is separate from bank account configuration.
-- Waiters only handle table orders in their active shift and assigned scope.
create function public.authorize_baneco_staff_order(p_restaurant uuid,p_order uuid,p_actor uuid) returns void
language plpgsql security definer set search_path=public as $$
declare o orders%rowtype; manager boolean; shift_action text;
begin
  manager:=exists(select 1 from profiles where id=p_actor and global_role='superadmin') or exists(
    select 1 from restaurant_memberships where user_id=p_actor and restaurant_id=p_restaurant and is_active and role in ('restaurant_admin','cashier'));
  if not manager and not exists(select 1 from restaurant_memberships where user_id=p_actor and restaurant_id=p_restaurant and is_active and role='waiter') then
    raise exception 'bank-forbidden' using errcode='42501';
  end if;
  if exists(select 1 from support_impersonation_sessions where actor_user_id=p_actor and status='active' and expires_at>now()) then
    raise exception 'bank-forbidden' using errcode='42501';
  end if;
  select * into o from orders where restaurant_id=p_restaurant and id=p_order;
  if not found then raise exception 'bank-order-ineligible';end if;
  if not manager then
    if o.order_type<>'table' or o.table_id is null or o.bank_checkout_hold then raise exception 'bank-forbidden' using errcode='42501';end if;
    select action into shift_action from admin_audit_logs where actor_user_id=p_actor and restaurant_id=p_restaurant
      and action in ('waiter_shift_opened','waiter_shift_closed') order by created_at desc,id desc limit 1;
    if shift_action is distinct from 'waiter_shift_opened' then raise exception 'bank-forbidden' using errcode='42501';end if;
    if exists(select 1 from waiter_table_assignments where restaurant_id=p_restaurant) and not exists(
      select 1 from waiter_table_assignments where restaurant_id=p_restaurant and table_id=o.table_id and waiter_user_id=p_actor) then
      raise exception 'bank-forbidden' using errcode='42501';
    end if;
  end if;
end $$;

create or replace function public.prepare_baneco_staff_order(p_restaurant uuid,p_order uuid,p_actor uuid) returns text
language plpgsql security definer set search_path=public as $$
declare o orders%rowtype; connection uuid;
begin
  perform authorize_baneco_staff_order(p_restaurant,p_order,p_actor);
  connection:=resolve_baneco_collection(p_restaurant);
  perform 1 from bank_qr_connections where id=connection and active and orders_enabled and check_result='ok' for update;
  if not found then raise exception 'bank-connection-unavailable';end if;
  select * into o from orders where id=p_order and restaurant_id=p_restaurant for update;
  if not found or o.bank_group_session_id is not null or o.group_order_session_id is not null
    or exists(select 1 from multisite_order_children where order_id=o.id) then raise exception 'bank-order-ineligible';end if;
  if o.payment_status='paid' then return o.tracking_token;end if;
  if o.payment_status<>'pending' or o.status in ('cancelled','delivered') or o.total not between .01 and 50000
    or coalesce(o.payment_receipt_url,'')<>'' or coalesce(o.payment_receipt_reference,'')<>'' then raise exception 'bank-order-ineligible';end if;
  update orders set payment_method='qr',bank_payment_required=true,bank_auto_accept=true where id=o.id;
  return o.tracking_token;
end $$;
revoke all on function public.guard_public_table_bank_payment(),public.link_table_order_to_open_visit(),public.authorize_baneco_staff_order(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.authorize_baneco_staff_order(uuid,uuid,uuid) to service_role;
