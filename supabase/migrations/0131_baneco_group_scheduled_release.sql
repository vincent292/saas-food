create function public.release_baneco_group_ready() returns jsonb
language plpgsql security definer set search_path=public as $$
declare o record; released jsonb:='[]';
begin
  for o in select ord.id,ord.order_type from orders ord join restaurants r on r.id=ord.restaurant_id
    join restaurant_settings s on s.restaurant_id=r.id
    where ord.bank_group_session_id is not null and ord.status='accepted' and ord.payment_status='paid'
      and (ord.requested_fulfillment_at is null or ord.requested_fulfillment_at<=now())
      and (coalesce(r.business_type::text,'food')<>'food' or s.kitchen_enabled=false)
    order by ord.created_at limit 10 for update of ord skip locked
  loop
    update orders set status='ready',ready_at=coalesce(ready_at,now()) where id=o.id;
    released:=released||jsonb_build_array(jsonb_build_object('orderId',o.id,'isDelivery',o.order_type='delivery'));
  end loop;
  return released;
end $$;
revoke all on function public.release_baneco_group_ready() from public,anon,authenticated;
grant execute on function public.release_baneco_group_ready() to service_role;

alter function public.dispatch_baneco_worker() rename to dispatch_baneco_worker_before_group_release;
create function public.dispatch_baneco_worker() returns bigint
language plpgsql security definer set search_path=public as $$
declare existing bigint; worker_secret text; issued_at text; signature text; request_id bigint;
begin
  existing:=dispatch_baneco_worker_before_group_release();
  if existing is not null then return existing; end if;
  if not exists(select 1 from orders o join restaurants r on r.id=o.restaurant_id join restaurant_settings s on s.restaurant_id=r.id
    where o.bank_group_session_id is not null and o.status='accepted' and o.payment_status='paid'
      and (o.requested_fulfillment_at is null or o.requested_fulfillment_at<=now())
      and (coalesce(r.business_type::text,'food')<>'food' or s.kitchen_enabled=false)) then return null; end if;
  select decrypted_secret into worker_secret from vault.decrypted_secrets where name='baneco_worker_secret';
  if worker_secret is null then return null; end if;
  issued_at:=floor(extract(epoch from clock_timestamp()))::bigint::text;
  signature:=encode(extensions.hmac('baneco-worker-v1:'||issued_at,worker_secret,'sha256'),'hex');
  select net.http_post(url:='https://www.yopido.shop/api/cron/bank-qr',headers:=jsonb_build_object('Content-Type','application/json','X-Baneco-Time',issued_at,'X-Baneco-Signature',signature),
    body:='{}'::jsonb,timeout_milliseconds:=60000) into request_id;
  return request_id;
end $$;
revoke all on function public.dispatch_baneco_worker(),public.dispatch_baneco_worker_before_group_release() from public,anon,authenticated,service_role;
