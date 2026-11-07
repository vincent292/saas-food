-- A verified future payment may open customer tracking while the independent
-- schedule hold still excludes it from staff, kitchen, queue and table visits.
create or replace function public.guard_bank_checkout_hold() returns trigger
language plpgsql security definer set search_path=public as $$
declare reservation boolean; operational boolean; scheduled_receipt boolean;
begin
  reservation:=new.bank_payment_required and new.payment_method='qr'
    and new.payment_status in ('pending','paid') and new.status='pending'
    and new.group_order_session_id is null and new.bank_group_session_id is null;
  operational:=new.status in ('accepted','preparing','ready','delivered');
  scheduled_receipt:=new.bank_schedule_hold and new.status='pending' and new.payment_status='paid';
  if tg_op='INSERT' then
    new.bank_checkout_hold:=reservation;
  elsif old.bank_checkout_hold or reservation then
    new.bank_checkout_hold:=true;
    if operational or scheduled_receipt then
      if new.payment_status<>'paid' or new.payment_method<>'qr' or not exists(
        select 1 from bank_qr_test_requests r where r.order_id=new.id
          and r.restaurant_id=new.restaurant_id and r.status='paid'
          and r.environment='production' and r.currency='BOB'
          and r.amount=new.total and (r.order_paid_at is not null or scheduled_receipt)
          and r.application_state<>'review'
          and r.bank_transaction_id is not distinct from new.payment_receipt_reference
      ) then raise exception 'bank-payment-required';end if;
      new.bank_checkout_hold:=false;
      if operational and new.table_id is not null then
        update tables set status='occupied' where id=new.table_id and restaurant_id=new.restaurant_id;
      end if;
    end if;
  elsif new.bank_checkout_hold then
    raise exception 'bank-payment-required';
  end if;
  return new;
end $$;

-- Preserve already verified scheduled checkouts if they were still waiting for
-- activation when the POS hold fix was deployed. The schedule hold stays set.
update public.orders o set bank_checkout_hold=false
  where o.bank_checkout_hold and o.bank_schedule_hold and o.payment_status='paid' and o.status='pending'
    and exists(select 1 from public.bank_qr_test_requests r where r.order_id=o.id
      and r.restaurant_id=o.restaurant_id and r.status='paid' and r.environment='production'
      and r.currency='BOB' and r.amount=o.total and r.application_state<>'review'
      and r.bank_transaction_id is not distinct from o.payment_receipt_reference);

create or replace function public.link_table_order_to_open_visit() returns trigger
language plpgsql security definer set search_path=public as $$
declare visit uuid;
begin
  if new.order_type<>'table' or new.table_id is null or new.table_visit_id is not null
    or new.bank_checkout_hold or new.bank_schedule_hold then return new;end if;
  perform pg_advisory_xact_lock(hashtextextended('table-visit:'||new.table_id::text,0));
  select id into visit from table_visits where restaurant_id=new.restaurant_id and table_id=new.table_id and status='open' for update;
  if visit is null then
    insert into table_visits(restaurant_id,table_id,opened_by) values(new.restaurant_id,new.table_id,auth.uid()) returning id into visit;
  end if;
  new.table_visit_id:=visit;
  return new;
end $$;
