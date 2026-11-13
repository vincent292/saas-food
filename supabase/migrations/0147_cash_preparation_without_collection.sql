-- Approving preparation is not evidence that cash has been received.
create function public.approve_cash_order_for_preparation(p_restaurant_id uuid,p_order_id uuid)
returns table(order_id uuid,resulting_status order_status,changed_at timestamptz,status_changed boolean)
language plpgsql security definer set search_path=public as $$
declare o orders%rowtype; session_id uuid; changed timestamptz:=now();
begin
  if auth.uid() is null or not (is_superadmin() or has_restaurant_role(p_restaurant_id,array['restaurant_admin','cashier']::app_role[])) then
    raise exception 'cash access denied' using errcode='42501';
  end if;
  if exists(select 1 from support_impersonation_sessions where actor_user_id=auth.uid() and status='active' and expires_at>now()) then
    raise exception 'cash access denied' using errcode='42501';
  end if;
  select id into session_id from cash_sessions where restaurant_id=p_restaurant_id and status='open'
    order by opened_at desc limit 1 for update;
  if not found then raise exception 'no-open-session';end if;
  select * into o from orders where restaurant_id=p_restaurant_id and id=p_order_id for update;
  if not found then raise exception 'order-not-found';end if;
  if o.order_type='table' or o.payment_method<>'cash' or o.payment_status<>'pending'
    or o.bank_payment_required or o.bank_checkout_hold or o.bank_schedule_hold then
    raise exception 'invalid-cash-approval' using errcode='22023';
  end if;
  if o.status='pending' then
    update orders set status='accepted',accepted_at=coalesce(accepted_at,changed),cancellation_reason=null where id=o.id;
    perform apply_order_inventory_usage(o.id);
    return query select o.id,'accepted'::order_status,changed,true;
  elsif o.status in ('accepted','preparing','ready') then
    return query select o.id,o.status,coalesce(o.accepted_at,changed),false;
  else raise exception 'invalid-order-transition' using errcode='22023';
  end if;
end $$;
revoke all on function public.approve_cash_order_for_preparation(uuid,uuid) from public,anon;
grant execute on function public.approve_cash_order_for_preparation(uuid,uuid) to authenticated;
