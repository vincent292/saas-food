-- A new POS/waiter QR is a private payment reservation, just like public
-- checkout. It becomes operational only after authoritative bank confirmation
-- and activation. Existing table orders being collected are not new drafts.
create or replace function public.guard_bank_checkout_hold() returns trigger
language plpgsql security definer set search_path=public as $$
declare reservation boolean;
begin
  reservation:=new.bank_payment_required and new.payment_method='qr'
    and new.payment_status in ('pending','paid') and new.status='pending'
    and new.group_order_session_id is null and new.bank_group_session_id is null;
  if tg_op='INSERT' then
    new.bank_checkout_hold:=reservation;
  elsif old.bank_checkout_hold or reservation then
    new.bank_checkout_hold:=true;
    if new.status in ('accepted','preparing','ready','delivered') then
      if new.payment_status<>'paid' or new.payment_method<>'qr' or not exists(
        select 1 from bank_qr_test_requests r where r.order_id=new.id
          and r.restaurant_id=new.restaurant_id and r.status='paid'
          and r.environment='production' and r.currency='BOB'
          and r.amount=new.total and r.order_paid_at is not null
          and r.application_state<>'review'
          and r.bank_transaction_id is not distinct from new.payment_receipt_reference
      ) then raise exception 'bank-payment-required';end if;
      new.bank_checkout_hold:=false;
      if new.table_id is not null then
        update tables set status='occupied' where id=new.table_id and restaurant_id=new.restaurant_id;
      end if;
    end if;
  elsif new.bank_checkout_hold then
    raise exception 'bank-payment-required';
  end if;
  return new;
end $$;

-- The payment write deliberately keeps the hold. Link a table visit only when
-- the activation write releases it, never when an unpaid QR is generated.
drop trigger if exists orders_link_table_visit on public.orders;
create trigger orders_link_table_visit before insert or update of payment_status,status on public.orders
  for each row execute function public.link_table_order_to_open_visit();

-- Waiters can resume their staff-origin QR drafts under the same membership,
-- shift and table-assignment checks. Public checkout reservations stay private.
create or replace function public.authorize_baneco_staff_order(p_restaurant uuid,p_order uuid,p_actor uuid) returns void
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
    if o.order_type is distinct from 'table' or o.table_id is null or (o.bank_checkout_hold and
      (o.order_origin is distinct from 'pos_counter' or not o.bank_payment_required or o.payment_method is distinct from 'qr')) then
      raise exception 'bank-forbidden' using errcode='42501';
    end if;
    select action into shift_action from admin_audit_logs where actor_user_id=p_actor and restaurant_id=p_restaurant
      and action in ('waiter_shift_opened','waiter_shift_closed') order by created_at desc,id desc limit 1;
    if shift_action is distinct from 'waiter_shift_opened' then raise exception 'bank-forbidden' using errcode='42501';end if;
    if exists(select 1 from waiter_table_assignments where restaurant_id=p_restaurant) and not exists(
      select 1 from waiter_table_assignments where restaurant_id=p_restaurant and table_id=o.table_id and waiter_user_id=p_actor) then
      raise exception 'bank-forbidden' using errcode='42501';
    end if;
  end if;
end $$;

-- Hide existing unactivated single-order reservations too. Do not undo orders
-- that have already entered preparation or change any confirmed bank payment.
update public.orders set bank_checkout_hold=true
  where bank_payment_required and payment_method='qr' and status='pending'
    and payment_status in ('pending','paid') and not bank_checkout_hold
    and group_order_session_id is null and bank_group_session_id is null;
