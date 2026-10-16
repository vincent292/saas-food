-- Browser recovery is a capability, independent from public request UUIDs.
alter table public.orders
  add column recovery_key_hash text check(recovery_key_hash is null or recovery_key_hash ~ '^[a-f0-9]{64}$'),
  add column bank_payment_required boolean not null default false,
  add column bank_auto_accept boolean not null default false;

create or replace function public.create_public_order_transaction(p_request_id uuid,p_order jsonb,p_items jsonb)
returns table(id uuid,tracking_token text) language plpgsql security definer set search_path=public as $$
declare dynamic_qr boolean:=false; payload jsonb:=p_order; created record; existing orders%rowtype; recovery text:=nullif(p_order->>'recovery_key_hash','');
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service-role-required' using errcode='42501'; end if;
  if recovery is not null and recovery !~ '^[a-f0-9]{64}$' then raise exception 'invalid-recovery-key'; end if;
  -- Serialize duplicate browser submissions before touching inventory, hours or
  -- payment. An idempotency UUID alone cannot recover a protected order.
  perform pg_advisory_xact_lock(hashtextextended((p_order->>'restaurant_id')||':'||p_request_id::text,0));
  select * into existing from orders o where o.restaurant_id=(p_order->>'restaurant_id')::uuid and o.public_request_id=p_request_id;
  if found then
    if existing.recovery_key_hash is not null and existing.recovery_key_hash is distinct from recovery then
      raise exception 'invalid-recovery-key' using errcode='42501';
    end if;
    return query select existing.id,existing.tracking_token; return;
  end if;
  if p_order->>'payment_method'='qr' then
    dynamic_qr:=coalesce(p_order->>'payment_receipt_url','')='' and (p_order->>'total')::numeric between 0.01 and 50000
      and exists(select 1 from bank_qr_connections c join restaurant_settings s on s.restaurant_id=c.restaurant_id
        where c.restaurant_id=(p_order->>'restaurant_id')::uuid and c.environment='production'
          and c.active and c.orders_enabled and c.check_result='ok' and s.currency='BOB');
    -- Existing group/POS clients are migrated separately, not silently rerouted
    -- to a different recipient. Only the new bank checkout forbids legacy proof.
    if not dynamic_qr and coalesce((p_order->>'bank_checkout')::boolean,false) then raise exception 'bank-qr-required'; end if;
    if dynamic_qr then payload:=jsonb_set(payload,'{requires_prepayment}','false'::jsonb); end if;
  end if;
  for created in select legacy.* from create_public_order_transaction_before_baneco(p_request_id,payload,p_items) legacy loop
    update orders set recovery_key_hash=recovery,bank_payment_required=dynamic_qr,bank_auto_accept=dynamic_qr,
      requires_prepayment=dynamic_qr or coalesce((p_order->>'requires_prepayment')::boolean,false)
      where orders.id=created.id;
    return query select created.id,created.tracking_token;
  end loop;
end $$;

create function public.guard_bank_order_preparation() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.bank_payment_required and old.payment_status<>'paid' and new.payment_status='paid' and not exists(
    select 1 from bank_qr_test_requests r where r.order_id=new.id and r.status='paid' and r.amount=new.total
      and new.payment_method='qr' and new.payment_receipt_reference is not distinct from r.bank_transaction_id) then
    raise exception 'bank-payment-required' using errcode='22023';
  end if;
  if new.bank_payment_required and new.payment_status<>'paid' and new.status in ('accepted','preparing','ready','delivered') then
    raise exception 'bank-payment-required' using errcode='22023';
  end if;
  return new;
end $$;
create trigger guard_bank_order_preparation before update of status,payment_status on public.orders
for each row execute function public.guard_bank_order_preparation();

-- Durable activation queue. Reconciliation never depends on the payer's browser.
create table public.bank_order_activations(
  request_id uuid primary key references public.bank_qr_test_requests(id) on delete restrict,
  created_at timestamptz not null default now(), completed_at timestamptz,
  operation_token uuid, operation_until timestamptz, attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(), notification_claimed boolean not null default false
);
alter table public.bank_order_activations enable row level security;
revoke all on public.bank_order_activations from public,anon,authenticated;
grant all on public.bank_order_activations to service_role;
create function public.queue_baneco_order_activation() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.order_paid_at is not null and old.order_paid_at is null
    and exists(select 1 from orders where id=new.order_id and bank_auto_accept) then
    insert into bank_order_activations(request_id) values(new.id) on conflict do nothing;
  end if;
  return null;
end $$;
create trigger queue_baneco_order_activation after update of order_paid_at on public.bank_qr_test_requests
for each row execute function public.queue_baneco_order_activation();

create function public.claim_baneco_order_activation(p_token uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare q bank_order_activations%rowtype; r bank_qr_test_requests%rowtype;
begin
  select * into q from bank_order_activations where completed_at is null and next_attempt_at<=now()
    and (operation_until is null or operation_until<now()) order by created_at limit 1 for update skip locked;
  if not found then return null; end if;
  update bank_order_activations set operation_token=p_token,operation_until=now()+interval '90 seconds',attempts=attempts+1 where request_id=q.request_id;
  select * into r from bank_qr_test_requests where id=q.request_id;
  return jsonb_build_object('requestId',q.request_id,'orderId',r.order_id,'restaurantId',r.restaurant_id);
end $$;

create function public.activate_baneco_paid_order(p_request_id uuid,p_token uuid,p_uses_kitchen boolean) returns jsonb
language plpgsql security definer set search_path=public as $$
declare q bank_order_activations%rowtype; r bank_qr_test_requests%rowtype; o orders%rowtype; notify boolean:=false;
  defer_ready boolean:=false; became_ready boolean:=false;
begin
  select * into q from bank_order_activations where request_id=p_request_id and operation_token=p_token and operation_until>now() for update;
  if not found then raise exception 'bank-operation-busy'; end if;
  select * into r from bank_qr_test_requests where id=q.request_id for update;
  select * into o from orders where id=r.order_id for update;
  if r.status<>'paid' or r.order_paid_at is null or r.application_state='review' or o.payment_status<>'paid'
    or not o.bank_auto_accept or o.status in ('cancelled','delivered') then
    update bank_order_activations set completed_at=now(),operation_until=null where request_id=q.request_id;
    return null;
  end if;
  defer_ready:=not p_uses_kitchen and o.requested_fulfillment_at>now();
  if o.status='pending' or (not p_uses_kitchen and o.status='accepted' and not coalesce(defer_ready,false)) then
    became_ready:=not p_uses_kitchen and not coalesce(defer_ready,false);
    update orders set status=case when became_ready then 'ready'::order_status else 'accepted'::order_status end,
      accepted_at=coalesce(accepted_at,now()),ready_at=case when became_ready then coalesce(ready_at,now()) else ready_at end
      where orders.id=o.id returning * into o;
  end if;
  -- Claim notifications once, not on every worker retry. Dispatch is retried
  -- independently by the existing rider workflow, never another bank charge.
  notify:=not q.notification_claimed or became_ready;
  update bank_order_activations set notification_claimed=true,
    operation_until=case when defer_ready then null else operation_until end,
    next_attempt_at=case when defer_ready then o.requested_fulfillment_at else next_attempt_at end where request_id=q.request_id;
  return jsonb_build_object('orderId',o.id,'status',o.status,'isDelivery',o.order_type='delivery','notify',notify,'deferred',coalesce(defer_ready,false));
end $$;
create function public.finish_baneco_order_activation(p_request_id uuid,p_token uuid,p_success boolean) returns void
language plpgsql security definer set search_path=public as $$
begin
  update bank_order_activations set completed_at=case when p_success then now() else null end,
    operation_until=null,next_attempt_at=now()+interval '2 minutes'
    where request_id=p_request_id and operation_token=p_token;
end $$;

create or replace function public.dispatch_baneco_worker() returns bigint
language plpgsql security definer set search_path=public as $$
declare worker_secret text; request_id bigint; issued_at text; signature text;
begin
  if not exists(select 1 from bank_qr_test_requests where qr_id is not null and status in ('pending','unknown','review','expired')
      and next_check_at<=now() and (operation_until is null or operation_until<now()))
    and not exists(select 1 from bank_qr_test_requests p where p.status='paid' and p.application_state='waiting_cash'
      and exists(select 1 from cash_sessions where restaurant_id=p.restaurant_id and status='open'))
    and not exists(select 1 from bank_order_activations where completed_at is null and next_attempt_at<=now()
      and (operation_until is null or operation_until<now())) then return null; end if;
  select decrypted_secret into worker_secret from vault.decrypted_secrets where name='baneco_worker_secret';
  if worker_secret is null then return null; end if;
  issued_at:=floor(extract(epoch from clock_timestamp()))::bigint::text;
  signature:=encode(extensions.hmac('baneco-worker-v1:'||issued_at,worker_secret,'sha256'),'hex');
  select net.http_post(url:='https://www.yopido.shop/api/cron/bank-qr',
    headers:=jsonb_build_object('Content-Type','application/json','X-Baneco-Time',issued_at,'X-Baneco-Signature',signature),body:='{}'::jsonb,timeout_milliseconds:=60000) into request_id;
  return request_id;
end $$;
revoke all on function public.guard_bank_order_preparation(),public.queue_baneco_order_activation(),public.claim_baneco_order_activation(uuid),
  public.activate_baneco_paid_order(uuid,uuid,boolean),public.finish_baneco_order_activation(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.claim_baneco_order_activation(uuid),public.activate_baneco_paid_order(uuid,uuid,boolean),public.finish_baneco_order_activation(uuid,uuid,boolean) to service_role;
