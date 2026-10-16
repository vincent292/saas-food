-- Bank receipt time is preserved. Operational preparation and the cash sale
-- wait until the scheduled start and an open session of that Bolivia day/later.
alter table public.orders add column bank_schedule_hold boolean not null default false;
update public.orders set bank_schedule_hold=true where bank_payment_required and bank_auto_accept
  and requested_fulfillment_at>now() and status='pending';
create function public.guard_bank_schedule() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' then
    new.bank_schedule_hold:=new.bank_payment_required and new.bank_auto_accept and new.requested_fulfillment_at>now();
    new.bank_schedule_hold:=coalesce(new.bank_schedule_hold,false);
  elsif old.bank_schedule_hold then
    if new.requested_fulfillment_at is distinct from old.requested_fulfillment_at then raise exception 'bank-schedule-immutable';end if;
    new.bank_schedule_hold:=true;
    if new.status in ('accepted','preparing','ready','delivered') then
      if new.payment_status<>'paid' or new.requested_fulfillment_at>now() or not exists(
        select 1 from cash_sessions where restaurant_id=new.restaurant_id and status='open'
          and (opened_at at time zone 'America/La_Paz')::date >= (new.requested_fulfillment_at at time zone 'America/La_Paz')::date
      ) then raise exception 'bank-schedule-not-due';end if;
      new.bank_schedule_hold:=false;
    end if;
  elsif new.bank_payment_required and new.bank_auto_accept and new.status='pending' and new.requested_fulfillment_at>now() then
    new.bank_schedule_hold:=true;
  elsif new.bank_schedule_hold then raise exception 'bank-schedule-invalid';
  end if;
  return new;
end $$;
create trigger guard_bank_schedule before insert or update on public.orders for each row execute function public.guard_bank_schedule();
create policy bank_schedule_not_operational on public.orders as restrictive for select to authenticated using(not bank_schedule_hold);
create or replace view public.bank_visible_orders with(security_invoker=true) as
  select * from public.orders where not bank_checkout_hold and not bank_schedule_hold;

-- Patch only cash-session selection; preserve all bank amount/reference,
-- inventory, multisite and idempotent ledger checks from prior migrations.
do $migration$
declare definition text; patched text;
begin
  definition:=pg_get_functiondef('public.apply_baneco_order_payment(uuid)'::regprocedure);
  patched:=replace(definition,'from cash_sessions where restaurant_id=r.restaurant_id and status=''open''',
    'from cash_sessions cs where cs.restaurant_id=r.restaurant_id and cs.status=''open'' and exists(
      select 1 from orders scheduled where scheduled.id=r.order_id and (scheduled.requested_fulfillment_at is null or
        (scheduled.requested_fulfillment_at<=now() and (cs.opened_at at time zone ''America/La_Paz'')::date >=
          (scheduled.requested_fulfillment_at at time zone ''America/La_Paz'')::date)))');
  if patched=definition then raise exception 'bank-schedule-cash-definition-changed';end if;
  execute patched;
end $migration$;

-- Scheduled orders may have been created yesterday but enter today's service.
do $migration$
declare target record; definition text; patched text;
begin
  for target in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_restaurant_dashboard_snapshot' loop
    definition:=pg_get_functiondef(target.oid);
    patched:=replace(definition,'where restaurant_id = p_restaurant_id and created_at >= v_day_start;',
      'where restaurant_id = p_restaurant_id and (created_at >= v_day_start or accepted_at >= v_day_start or ready_at >= v_day_start);');
    if patched=definition then raise exception 'bank-schedule-dashboard-definition-changed';end if;
    execute patched;
  end loop;
end $migration$;

create or replace function public.post_waiting_baneco_payments() returns integer
language plpgsql security definer set search_path=public as $$
declare r record; count_posted integer:=0;
begin
  for r in select payment.id from bank_qr_test_requests payment join orders o on o.id=payment.order_id
    where payment.status='paid' and payment.application_state='waiting_cash'
      and (o.requested_fulfillment_at is null or o.requested_fulfillment_at<=now())
      and exists(select 1 from cash_sessions where restaurant_id=payment.restaurant_id and status='open'
        and (o.requested_fulfillment_at is null or (opened_at at time zone 'America/La_Paz')::date >= (o.requested_fulfillment_at at time zone 'America/La_Paz')::date))
    order by payment.created_at limit 10 for update of payment skip locked
  loop
    if apply_baneco_order_payment(r.id)='applied' then count_posted:=count_posted+1;end if;
  end loop;
  return count_posted;
end $$;

create or replace function public.queue_baneco_order_activation() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.order_paid_at is not null and old.order_paid_at is null then
    insert into bank_order_activations(request_id,next_attempt_at)
      select new.id,greatest(now(),coalesce(requested_fulfillment_at,now())) from orders where id=new.order_id and bank_auto_accept
      on conflict do nothing;
  end if;
  return null;
end $$;
-- Existing jobs must wait too, without changing paid/accepted historical orders.
update public.bank_order_activations a set next_attempt_at=o.requested_fulfillment_at
  from public.bank_qr_test_requests r join public.orders o on o.id=r.order_id
  where a.request_id=r.id and a.completed_at is null and o.bank_schedule_hold and o.requested_fulfillment_at>now();

create or replace function public.activate_baneco_paid_order(p_request_id uuid,p_token uuid,p_uses_kitchen boolean) returns jsonb
language plpgsql security definer set search_path=public as $$
declare q bank_order_activations%rowtype; r bank_qr_test_requests%rowtype; o orders%rowtype; notify boolean:=false; became_ready boolean:=false;
begin
  select * into q from bank_order_activations where request_id=p_request_id and operation_token=p_token and operation_until>now() for update;
  if not found then raise exception 'bank-operation-busy';end if;
  select * into r from bank_qr_test_requests where id=q.request_id for update;
  -- Preserve cash -> order locking order used by settlement/close workflows.
  perform 1 from cash_sessions where restaurant_id=r.restaurant_id and status='open' order by opened_at desc limit 1 for update;
  select * into o from orders where id=r.order_id for update;
  if r.status<>'paid' or r.order_paid_at is null or r.application_state='review' or o.payment_status<>'paid'
    or not o.bank_auto_accept or o.status in ('cancelled','delivered') then
    update bank_order_activations set completed_at=now(),operation_until=null where request_id=q.request_id;return null;
  end if;
  if o.requested_fulfillment_at is not null and (o.requested_fulfillment_at>now() or not exists(
    select 1 from cash_sessions where restaurant_id=o.restaurant_id and status='open'
      and (opened_at at time zone 'America/La_Paz')::date >= (o.requested_fulfillment_at at time zone 'America/La_Paz')::date
  )) then
    update bank_order_activations set operation_until=null,next_attempt_at=greatest(now()+interval '1 minute',o.requested_fulfillment_at) where request_id=q.request_id;
    return jsonb_build_object('orderId',o.id,'status',o.status,'isDelivery',o.order_type='delivery','notify',false,'deferred',true);
  end if;
  if o.status='pending' or (not p_uses_kitchen and o.status='accepted') then
    became_ready:=not p_uses_kitchen;
    update orders set status=case when became_ready then 'ready'::order_status else 'accepted'::order_status end,
      bank_schedule_hold=false,accepted_at=coalesce(accepted_at,now()),ready_at=case when became_ready then coalesce(ready_at,now()) else ready_at end
      where orders.id=o.id returning * into o;
  end if;
  notify:=not q.notification_claimed or became_ready;
  update bank_order_activations set notification_claimed=true where request_id=q.request_id;
  return jsonb_build_object('orderId',o.id,'status',o.status,'isDelivery',o.order_type='delivery','notify',notify,'deferred',false);
end $$;
revoke all on function public.guard_bank_schedule() from public,anon,authenticated,service_role;
