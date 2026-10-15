-- A callback is a hint to query Baneco, never proof of payment.
alter table public.bank_qr_test_requests add column notification_received_at timestamptz;
create index bank_qr_lookup_idx on public.bank_qr_test_requests(qr_id) where qr_id is not null;
create unique index bank_qr_production_id_idx on public.bank_qr_test_requests(qr_id) where qr_id is not null and environment='production';
create function public.queue_baneco_payment_notification(p_qr_id text) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if p_qr_id is null or p_qr_id !~ '^[A-Za-z0-9_-]{1,100}$' then return null; end if;
  -- The production callback cannot wake up unrelated certification credentials.
  update bank_qr_test_requests set notification_received_at=clock_timestamp(),next_check_at=now()
  where qr_id=p_qr_id and environment='production' and status in ('pending','unknown','expired','review')
    and (notification_received_at is null or notification_received_at<now()-interval '15 seconds')
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.queue_baneco_payment_notification(text) from public,anon,authenticated;
grant execute on function public.queue_baneco_payment_notification(text) to service_role;

create or replace function public.claim_baneco_reconciliation(p_token uuid,p_id uuid default null,p_cancel boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r bank_qr_test_requests%rowtype;
begin
  if p_token is null or (p_cancel and p_id is null) then raise exception 'bank-invalid-input'; end if;
  select * into r from bank_qr_test_requests
  where (p_id is null or id=p_id) and qr_id is not null and status in ('pending','unknown','review','expired')
    and (operation_until is null or operation_until<now())
    and (p_cancel or next_check_at<=now() or (notification_received_at is not null
      and (last_attempt_at is null or notification_received_at>last_attempt_at)))
  order by next_check_at,id for update skip locked limit 1;
  if not found then return null; end if;
  update bank_qr_test_requests set operation_token=p_token,operation_until=now()+interval '90 seconds',
    last_attempt_at=clock_timestamp(),next_check_at=now()+interval '90 seconds' where id=r.id returning * into r;
  return to_jsonb(r)-'qr_image';
end $$;

create function public.broadcast_bank_qr_change() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and new.status is not distinct from old.status
    and new.qr_id is not distinct from old.qr_id and new.last_error_code is not distinct from old.last_error_code then return null; end if;
  -- No credentials, image, amount, sender identity or bank payload in Realtime.
  perform realtime.send(jsonb_build_object('changed',true),'changed','bank-qr:superadmin',true);
  return null;
exception when others then return null;
end $$;
create trigger broadcast_bank_qr_change_trigger after insert or update on public.bank_qr_test_requests
for each row execute function public.broadcast_bank_qr_change();

create policy "superadmins receive private bank updates" on realtime.messages
for select to authenticated using (
  realtime.topic()='bank-qr:superadmin' and public.is_superadmin()
  and coalesce((auth.jwt()->'user_metadata'->>'must_change_password')::boolean,false)=false
  and not exists(select 1 from public.support_impersonation_sessions s
    where s.actor_user_id=auth.uid() and s.status='active' and s.expires_at>now())
);
-- There is intentionally no client INSERT/send policy for this topic.
