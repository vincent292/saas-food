-- Production apex redirects HTTP POST to www (308). Do not depend on pg_net
-- following redirects or forwarding authentication headers across hosts.
create or replace function public.dispatch_baneco_worker() returns bigint
language plpgsql security definer set search_path=public as $$
declare worker_secret text; request_id bigint; issued_at text; signature text;
begin
  if not exists(select 1 from bank_qr_test_requests where qr_id is not null
    and status in ('pending','unknown','review','expired') and next_check_at<=now()
    and (operation_until is null or operation_until<now())) then return null; end if;
  select decrypted_secret into worker_secret from vault.decrypted_secrets where name='baneco_worker_secret';
  if worker_secret is null then return null; end if;
  issued_at:=floor(extract(epoch from clock_timestamp()))::bigint::text;
  signature:=encode(extensions.hmac('baneco-worker-v1:'||issued_at,worker_secret,'sha256'),'hex');
  select net.http_post(url:='https://www.yopido.shop/api/cron/bank-qr',
    headers:=jsonb_build_object('Content-Type','application/json','X-Baneco-Time',issued_at,'X-Baneco-Signature',signature),
    body:='{}'::jsonb,timeout_milliseconds:=60000) into request_id;
  return request_id;
end $$;
revoke all on function public.dispatch_baneco_worker() from public,anon,authenticated;
