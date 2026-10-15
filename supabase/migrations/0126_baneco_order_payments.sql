alter table public.bank_qr_connections add column orders_enabled boolean not null default false;
alter table public.bank_qr_test_requests
  alter column created_by drop not null,
  add column order_id uuid references public.orders(id) on delete restrict,
  add column order_paid_at timestamptz,
  add column application_state text not null default 'not_linked' check(application_state in ('not_linked','pending','waiting_cash','applied','review')),
  add column application_code text,
  add column applied_at timestamptz;
alter table public.bank_qr_test_requests drop constraint bank_qr_test_requests_amount_check;
alter table public.bank_qr_test_requests add constraint bank_qr_test_requests_amount_check check(amount>=0.01 and amount<=50000);
create unique index bank_qr_one_live_order_payment_idx on public.bank_qr_test_requests(order_id)
  where order_id is not null and status not in ('failed','cancelled');
alter table public.cash_movements add column bank_qr_request_id uuid references public.bank_qr_test_requests(id) on delete restrict;
create unique index cash_movement_bank_qr_once_idx on public.cash_movements(bank_qr_request_id) where bank_qr_request_id is not null;
create unique index cash_movement_bank_order_once_idx on public.cash_movements(order_id)
  where bank_qr_request_id is not null and type='sale';

create function public.reserve_baneco_order_qr(p_order_id uuid,p_tracking_token text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare o orders%rowtype; c bank_qr_connections%rowtype; r bank_qr_test_requests%rowtype; new_id uuid:=gen_random_uuid();
begin
  -- Lock connection before order, compatible with connection disable/reserve.
  select connection.* into c from bank_qr_connections connection join orders ord on ord.restaurant_id=connection.restaurant_id
    where ord.id=p_order_id and ord.tracking_token=p_tracking_token and connection.environment='production'
      and connection.active and connection.orders_enabled and connection.check_result='ok' for update of connection;
  if not found then raise exception 'bank-connection-unavailable'; end if;
  select * into o from orders where id=p_order_id and tracking_token=p_tracking_token for update;
  if not found then raise exception 'bank-request-unavailable'; end if;
  if o.payment_status<>'pending' or o.status not in ('pending','accepted','preparing','ready')
    or o.total<0.01 or o.total>50000 or o.payment_method<>'qr'
    or coalesce(o.payment_receipt_url,'')<>'' or coalesce(o.payment_receipt_reference,'')<>''
    or not exists(select 1 from restaurant_settings where restaurant_id=o.restaurant_id and currency='BOB')
    or o.group_order_session_id is not null
    or exists(select 1 from multisite_order_children child where child.order_id=o.id) then raise exception 'bank-order-ineligible'; end if;
  -- Never map a historical pilot QR to an order or infer a match by amount.
  select * into r from bank_qr_test_requests where order_id=o.id and status not in ('failed','cancelled');
  if found then return jsonb_build_object('claimed',false,'request',to_jsonb(r)-'qr_image'); end if;
  insert into bank_qr_test_requests(id,connection_id,restaurant_id,environment,transaction_id,amount,currency,due_date,description,order_id,application_state)
    values(new_id,c.id,o.restaurant_id,'production','YQ-'||replace(new_id::text,'-',''),o.total,'BOB',
      (now() at time zone 'America/La_Paz')::date,left('Pedido '||o.order_number,150),o.id,'pending') returning * into r;
  return jsonb_build_object('claimed',true,'request',to_jsonb(r)-'qr_image');
end $$;

create function public.apply_baneco_order_payment(p_request_id uuid) returns text
language plpgsql security definer set search_path=public as $$
declare r bank_qr_test_requests%rowtype; o orders%rowtype; session_id uuid; movement_id uuid; conflict text;
begin
  select * into r from bank_qr_test_requests where id=p_request_id for update;
  if not found or r.order_id is null or r.status<>'paid' then return 'not_linked'; end if;
  if r.application_state in ('applied','review') then return r.application_state; end if;
  -- Same cash -> order lock order as charge/refund/close workflows.
  select id into session_id from cash_sessions where restaurant_id=r.restaurant_id and status='open'
    order by opened_at desc limit 1 for update;
  select * into o from orders where id=r.order_id for update;
  if not found or o.restaurant_id<>r.restaurant_id or r.environment<>'production' or r.currency<>'BOB' then conflict:='order_mismatch';
  elsif o.total<>r.amount then conflict:='total_changed';
  elsif o.status='cancelled' or o.payment_status in ('cancelled','refunded') then conflict:='order_cancelled_or_refunded';
  elsif o.group_order_session_id is not null or exists(select 1 from multisite_order_children child where child.order_id=o.id) then conflict:='group_payment_unsupported';
  elsif o.payment_status='paid' and (r.order_paid_at is null or o.payment_receipt_reference is distinct from r.bank_transaction_id) then conflict:='already_paid';
  elsif exists(select 1 from cash_movements where order_id=o.id and type='sale' and bank_qr_request_id is distinct from r.id) then conflict:='sale_already_recorded';
  end if;
  if conflict is not null then
    update bank_qr_test_requests set application_state='review',application_code=conflict where id=r.id;
    return 'review';
  end if;
  -- Payment does not approve preparation. The local uses its existing approval
  -- action (including kitchen mode, scheduling, dispatch and notifications).
  if r.order_paid_at is null then
    update orders set payment_status='paid',payment_method='qr',payment_receipt_reference=r.bank_transaction_id,payment_verified_at=now()
      where id=o.id;
    perform apply_order_inventory_usage(o.id);
    update bank_qr_test_requests set order_paid_at=now() where id=r.id;
  end if;
  if session_id is null then
    update bank_qr_test_requests set application_state='waiting_cash',application_code='no_open_session' where id=r.id;
    return 'waiting_cash';
  end if;
  insert into cash_movements(restaurant_id,cash_session_id,order_id,type,payment_method,amount,description,created_by,bank_qr_request_id)
    values(r.restaurant_id,session_id,o.id,'sale','qr',r.amount,'Pago Baneco de pedido '||o.order_number,null,r.id)
    on conflict(bank_qr_request_id) where bank_qr_request_id is not null do nothing returning id into movement_id;
  update bank_qr_test_requests set application_state='applied',application_code=null,applied_at=now() where id=r.id;
  return 'applied';
exception when others then
  -- Bank confirmation survives local inventory/accounting failures. No raw SQL or
  -- bank payload is stored or exposed. A human can review before another charge.
  update bank_qr_test_requests set application_state='review',application_code='application_failed' where id=p_request_id;
  return 'review';
end $$;

create function public.apply_confirmed_baneco_payment_trigger() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.status='paid' and new.order_id is not null and old.status is distinct from 'paid' then
    perform apply_baneco_order_payment(new.id);
  end if;
  return null;
end $$;
create trigger apply_confirmed_baneco_payment after update of status on public.bank_qr_test_requests
for each row execute function public.apply_confirmed_baneco_payment_trigger();

create function public.post_waiting_baneco_payments() returns integer
language plpgsql security definer set search_path=public as $$
declare r record; count_posted integer:=0;
begin
  for r in select payment.id from bank_qr_test_requests payment where payment.status='paid'
    and payment.order_id is not null and payment.application_state='waiting_cash'
    and exists(select 1 from cash_sessions where restaurant_id=payment.restaurant_id and status='open')
    order by payment.created_at limit 10 for update of payment skip locked
  loop
    if apply_baneco_order_payment(r.id)='applied' then count_posted:=count_posted+1; end if;
  end loop;
  return count_posted;
end $$;
revoke all on function public.reserve_baneco_order_qr(uuid,text),public.apply_baneco_order_payment(uuid),public.post_waiting_baneco_payments(),public.apply_confirmed_baneco_payment_trigger() from public,anon,authenticated;
grant execute on function public.reserve_baneco_order_qr(uuid,text),public.post_waiting_baneco_payments() to service_role;

-- Wake the durable worker for accounting as well as unsettled bank statuses.
create or replace function public.dispatch_baneco_worker() returns bigint
language plpgsql security definer set search_path=public as $$
declare worker_secret text; request_id bigint; issued_at text; signature text;
begin
  if not exists(select 1 from bank_qr_test_requests where qr_id is not null
    and status in ('pending','unknown','review','expired') and next_check_at<=now()
    and (operation_until is null or operation_until<now()))
    and not exists(select 1 from bank_qr_test_requests payment where payment.status='paid' and payment.application_state='waiting_cash'
      and exists(select 1 from cash_sessions where restaurant_id=payment.restaurant_id and status='open')) then return null; end if;
  select decrypted_secret into worker_secret from vault.decrypted_secrets where name='baneco_worker_secret';
  if worker_secret is null then return null; end if;
  issued_at:=floor(extract(epoch from clock_timestamp()))::bigint::text;
  signature:=encode(extensions.hmac('baneco-worker-v1:'||issued_at,worker_secret,'sha256'),'hex');
  select net.http_post(url:='https://www.yopido.shop/api/cron/bank-qr',
    headers:=jsonb_build_object('Content-Type','application/json','X-Baneco-Time',issued_at,'X-Baneco-Signature',signature),
    body:='{}'::jsonb,timeout_milliseconds:=60000) into request_id;
  return request_id;
end $$;

-- An accounting state change must also reach the private admin channel.
create function public.broadcast_bank_application_change() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.application_state is distinct from old.application_state then
    perform realtime.send(jsonb_build_object('changed',true),'changed','bank-qr:superadmin',true);
  end if;
  return null;
exception when others then return null;
end $$;
create trigger broadcast_bank_application_change after update of application_state on public.bank_qr_test_requests
for each row execute function public.broadcast_bank_application_change();

create function public.broadcast_bank_order_payment_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare tracking text;
begin
  if new.order_id is not null and new.status is distinct from old.status then
    select tracking_token into tracking from public.orders where id=new.order_id;
    if tracking is not null then
      perform realtime.send(jsonb_build_object('order_id',new.order_id),'changed','bank-order-payment:'||tracking,false);
    end if;
  end if;
  return null;
exception when others then return null;
end $$;
create trigger broadcast_bank_order_payment_change after update of status on public.bank_qr_test_requests
for each row execute function public.broadcast_bank_order_payment_change();

create function public.broadcast_bank_order_state_change() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if (new.status is distinct from old.status or new.payment_status is distinct from old.payment_status or new.total is distinct from old.total)
    and exists(select 1 from public.bank_qr_test_requests where order_id=new.id) then
    perform realtime.send(jsonb_build_object('order_id',new.id),'changed','bank-order-payment:'||new.tracking_token,false);
  end if;
  return null;
exception when others then return null;
end $$;
create trigger broadcast_bank_order_state_change after update of status,payment_status,total on public.orders
for each row execute function public.broadcast_bank_order_state_change();

create function public.approve_prepaid_order_for_preparation(p_restaurant_id uuid,p_order_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare o orders%rowtype;
begin
  if auth.uid() is null or not (is_superadmin() or has_restaurant_role(p_restaurant_id,array['restaurant_admin','cashier']::app_role[])) then
    raise exception 'cash access denied' using errcode='42501'; end if;
  select * into o from orders where id=p_order_id and restaurant_id=p_restaurant_id for update;
  if not found or o.payment_status<>'paid' or o.order_type='table' then raise exception 'invalid-order-transition'; end if;
  if o.status='pending' then
    update orders set status='accepted',accepted_at=coalesce(accepted_at,now()) where id=o.id;
    perform apply_order_inventory_usage(o.id);
  elsif o.status not in ('accepted','preparing','ready') then raise exception 'invalid-order-transition'; end if;
  return o.id;
end $$;
revoke all on function public.approve_prepaid_order_for_preparation(uuid,uuid) from public,anon;
grant execute on function public.approve_prepaid_order_for_preparation(uuid,uuid) to authenticated;

create function public.guard_active_baneco_order_payment() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if old.payment_status='paid' and new.payment_status='refunded'
    and exists(select 1 from bank_qr_test_requests r where r.order_id=new.id and r.status='paid' and r.application_state<>'applied') then
    raise exception 'bank-qr-posting-pending' using errcode='22023';
  end if;
  if ((old.payment_status='pending' and new.payment_status='paid') or new.total is distinct from old.total)
    and exists(select 1 from bank_qr_test_requests r where r.order_id=new.id and (
      r.status in ('generating','pending','unknown','expired','review')
      or (r.status='paid' and not (new.payment_status='paid' and new.payment_method='qr'
        and new.payment_receipt_reference is not distinct from r.bank_transaction_id and new.total=r.amount)))) then
    raise exception 'bank-qr-active-cancel-first' using errcode='22023';
  end if;
  return new;
end $$;
create trigger guard_active_baneco_order_payment before update of payment_status,total on public.orders
for each row execute function public.guard_active_baneco_order_payment();
revoke all on function public.guard_active_baneco_order_payment() from public,anon,authenticated;

create function public.retry_baneco_order_payment(p_request_id uuid) returns text
language plpgsql security definer set search_path=public as $$
declare r bank_qr_test_requests%rowtype;
begin
  select * into r from bank_qr_test_requests where id=p_request_id for update;
  if not found or r.status<>'paid' or r.order_id is null then raise exception 'bank-request-unavailable'; end if;
  if r.application_state='applied' then return 'applied'; end if;
  update bank_qr_test_requests set application_state='pending' where id=r.id;
  return apply_baneco_order_payment(r.id);
end $$;
revoke all on function public.retry_baneco_order_payment(uuid) from public,anon,authenticated;
grant execute on function public.retry_baneco_order_payment(uuid) to service_role;
