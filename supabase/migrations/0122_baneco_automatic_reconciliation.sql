-- Durable reconciliation leases/backoff. No payment is inferred from the client.
alter table public.bank_qr_test_requests
  add column next_check_at timestamptz not null default now(),
  add column last_attempt_at timestamptz,
  add column consecutive_failures integer not null default 0 check(consecutive_failures>=0);
create index bank_qr_due_idx on public.bank_qr_test_requests(next_check_at)
  where qr_id is not null and status in ('pending','unknown','review','expired');

create function public.claim_baneco_reconciliation(p_token uuid,p_id uuid default null,p_cancel boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r bank_qr_test_requests%rowtype;
begin
  if p_token is null or (p_cancel and p_id is null) then raise exception 'bank-invalid-input'; end if;
  select * into r from bank_qr_test_requests
  where (p_id is null or id=p_id) and qr_id is not null
    and status in ('pending','unknown','review','expired')
    and (operation_until is null or operation_until<now())
    and (p_cancel or next_check_at<=now())
  order by next_check_at,id for update skip locked limit 1;
  if not found then return null; end if;
  update bank_qr_test_requests set operation_token=p_token,operation_until=now()+interval '90 seconds',
    last_attempt_at=now(),next_check_at=now()+interval '90 seconds' where id=r.id returning * into r;
  return to_jsonb(r)-'qr_image';
end $$;

create function public.finish_baneco_reconciliation(p_id uuid,p_token uuid,p_status text,p_transaction text,p_error text,p_details jsonb)
returns boolean language plpgsql security definer set search_path=public as $$
declare r bank_qr_test_requests%rowtype; delay_seconds integer;
begin
  select * into r from bank_qr_test_requests where id=p_id and operation_token=p_token for update;
  if not found or r.status in ('paid','cancelled') then return false; end if;
  if p_error is null and (p_status is null or p_status not in ('pending','paid','cancelled','expired','review')) then
    raise exception 'bank-invalid-input';
  end if;
  if p_error is null and p_status='paid' and nullif(trim(p_transaction),'') is null then raise exception 'bank-invalid-input'; end if;
  delay_seconds:=case when p_error is not null then least(3600,60*power(2,least(r.consecutive_failures,6)))::integer
    when p_status in ('review','expired') then 3600 else 60 end;
  update bank_qr_test_requests set
    status=case when p_error is null then p_status else status end,
    bank_transaction_id=case when p_error is null and p_status='paid' then p_transaction else bank_transaction_id end,
    verified_at=case when p_error is null then now() else verified_at end,
    consecutive_failures=case when p_error is null then 0 else least(consecutive_failures+1,1000000) end,
    next_check_at=now()+make_interval(secs=>delay_seconds),
    last_error_code=p_error,
    last_error_stage=case when p_error is not null then p_details->>'last_error_stage' end,
    last_http_status=case when p_error is not null then (p_details->>'last_http_status')::integer end,
    last_bank_code=case when p_error is not null then (p_details->>'last_bank_code')::integer end,
    operation_token=null,operation_until=null,updated_at=now()
  where id=p_id and operation_token=p_token;
  return found;
end $$;
revoke all on function public.claim_baneco_reconciliation(uuid,uuid,boolean),public.finish_baneco_reconciliation(uuid,uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.claim_baneco_reconciliation(uuid,uuid,boolean),public.finish_baneco_reconciliation(uuid,uuid,text,text,text,jsonb) to service_role;
