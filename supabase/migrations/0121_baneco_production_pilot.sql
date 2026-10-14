-- Superadmin QR pilot in both bank environments. No order/cash mutations.
alter table public.bank_qr_connections
  add column last_error_code text,
  add column last_error_stage text check(last_error_stage in ('password-encryption','authentication','account-encryption','generation','status','cancellation')),
  add column last_http_status integer check(last_http_status between 100 and 599),
  add column last_bank_code integer;
alter table public.bank_qr_test_requests
  add column environment text check(environment in ('certification','production')),
  add column last_error_stage text check(last_error_stage in ('password-encryption','authentication','account-encryption','generation','status','cancellation')),
  add column last_http_status integer check(last_http_status between 100 and 599),
  add column last_bank_code integer;
update public.bank_qr_test_requests r set environment=c.environment
from public.bank_qr_connections c where c.id=r.connection_id;
alter table public.bank_qr_test_requests alter column environment set not null;
alter table public.bank_qr_test_requests drop constraint bank_qr_test_requests_status_check;
alter table public.bank_qr_test_requests add constraint bank_qr_test_requests_status_check
  check(status in ('generating','unknown','failed','pending','paid','cancelled','expired','review'));

create or replace function public.reserve_baneco_test_qr(
  p_id uuid,p_connection_id uuid,p_actor_id uuid,p_amount numeric,p_currency text,p_due_date date,p_description text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_connection bank_qr_connections%rowtype;
  v_request bank_qr_test_requests%rowtype;
  v_today date := (now() at time zone 'America/La_Paz')::date;
begin
  if not exists(select 1 from profiles where id=p_actor_id and global_role='superadmin') then
    raise exception 'bank-forbidden' using errcode='42501';
  end if;
  select * into v_connection from bank_qr_connections where id=p_connection_id for update;
  if not found or not v_connection.active or v_connection.environment not in ('certification','production') then
    raise exception 'bank-connection-unavailable';
  end if;
  if p_id is null or p_amount is null or p_amount<0.01 or p_amount>100 or p_amount<>round(p_amount,2)
    or p_currency not in ('BOB','USD') or p_currency is null or p_due_date is null
    or p_due_date<v_today or p_due_date>v_today+30 or p_description is null or length(p_description)>150 then
    raise exception 'bank-invalid-input';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  select * into v_request from bank_qr_test_requests where id=p_id;
  if found then
    if v_request.connection_id<>p_connection_id or v_request.amount<>p_amount or v_request.currency<>p_currency
      or v_request.due_date<>p_due_date or v_request.description<>p_description or v_request.created_by<>p_actor_id then
      raise exception 'bank-request-conflict';
    end if;
    return jsonb_build_object('claimed',false,'request',to_jsonb(v_request));
  end if;
  if v_connection.check_result is distinct from 'ok' then
    raise exception 'bank-connection-unverified';
  end if;
  insert into bank_qr_test_requests(id,connection_id,restaurant_id,environment,transaction_id,amount,currency,due_date,description,created_by)
  values(p_id,p_connection_id,v_connection.restaurant_id,v_connection.environment,'YQ-'||replace(p_id::text,'-',''),p_amount,p_currency,p_due_date,p_description,p_actor_id)
  returning * into v_request;
  return jsonb_build_object('claimed',true,'request',to_jsonb(v_request));
end $$;
revoke all on function public.reserve_baneco_test_qr(uuid,uuid,uuid,numeric,text,date,text) from public,anon,authenticated;
grant execute on function public.reserve_baneco_test_qr(uuid,uuid,uuid,numeric,text,date,text) to service_role;
