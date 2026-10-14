-- Supabase drives this worker even on Vercel Hobby and with every browser closed.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;
create extension if not exists pgcrypto with schema extensions;

create function public.configure_baneco_worker(p_secret text) returns void
language plpgsql security definer set search_path=public as $$
declare secret_id uuid;
begin
  if p_secret is null or length(p_secret)<32 or length(p_secret)>256 then raise exception 'bank-invalid-input'; end if;
  select id into secret_id from vault.secrets where name='baneco_worker_secret';
  if secret_id is null then perform vault.create_secret(p_secret,'baneco_worker_secret');
  else perform vault.update_secret(secret_id,p_secret); end if;
end $$;

create function public.dispatch_baneco_worker() returns bigint
language plpgsql security definer set search_path=public as $$
declare worker_secret text; request_id bigint; issued_at text; signature text;
begin
  if not exists(select 1 from bank_qr_test_requests where qr_id is not null
    and status in ('pending','unknown','review','expired') and next_check_at<=now()
    and (operation_until is null or operation_until<now())) then return null; end if;
  select decrypted_secret into worker_secret from vault.decrypted_secrets where name='baneco_worker_secret';
  if worker_secret is null then return null; end if;
  -- pg_net stores queued headers. Never enqueue the reusable Vault secret.
  issued_at:=floor(extract(epoch from clock_timestamp()))::bigint::text;
  signature:=encode(extensions.hmac('baneco-worker-v1:'||issued_at,worker_secret,'sha256'),'hex');
  select net.http_post(url:='https://yopido.shop/api/cron/bank-qr',
    headers:=jsonb_build_object('Content-Type','application/json','X-Baneco-Time',issued_at,'X-Baneco-Signature',signature),
    body:='{}'::jsonb,timeout_milliseconds:=60000) into request_id;
  return request_id;
end $$;
revoke all on function public.configure_baneco_worker(text),public.dispatch_baneco_worker() from public,anon,authenticated;
grant execute on function public.configure_baneco_worker(text) to service_role;
-- Dispatch runs as postgres via cron, not as an exposed public RPC.
select cron.schedule('baneco-qr-reconciliation','* * * * *','select public.dispatch_baneco_worker()');
