-- An active checkout may recheck a healthy pending QR every eight seconds.
-- Keep the exclusive lease and the full outage/review backoff intact.
do $migration$
declare definition text; patched text;
begin
  definition := pg_get_functiondef('public.claim_baneco_reconciliation(uuid,uuid,boolean)'::regprocedure);
  if position('interval ''8 seconds''' in definition) = 0 then
    patched := replace(definition, 'and (p_cancel or next_check_at<=now()',
      'and (p_cancel or next_check_at<=now() or (p_id is not null and status in (''pending'',''unknown'')
        and consecutive_failures=0 and created_at>now()-interval ''30 minutes''
        and (last_attempt_at is null or last_attempt_at<=now()-interval ''8 seconds''))');
    if patched=definition then raise exception 'bank-reconciliation-definition-changed';end if;
    execute patched;
  end if;
end $migration$;

-- Keep newly-issued healthy QRs responsive even after the checkout closes.
-- Never shorten outage/review backoff or spend this cadence on old drafts.
do $migration$
declare definition text; patched text;
begin
  definition := pg_get_functiondef('public.finish_baneco_reconciliation(uuid,uuid,text,text,text,jsonb)'::regprocedure);
  patched := replace(definition, 'when p_status in (''review'',''expired'') then 3600 else 60 end;',
    'when p_status in (''review'',''expired'') then 3600
     when p_status=''pending'' and r.created_at>now()-interval ''15 minutes'' then 8 else 60 end;');
  if patched=definition and position('interval ''15 minutes''' in definition)=0 then
    raise exception 'bank-reconciliation-finish-definition-changed';
  end if;
  if patched<>definition then execute patched;end if;
end $migration$;

do $scheduler$
declare job record;
begin
  if to_regclass('cron.job') is not null then
    for job in execute 'select jobid from cron.job where jobname=''baneco-qr-reconciliation'' and active' loop
      perform cron.alter_job(job.jobid, schedule := '15 seconds');
    end loop;
  end if;
end $scheduler$;

-- A verified checkout must not wait behind unrelated notification jobs.
create function public.claim_baneco_order_activation_for_request(p_request_id uuid,p_token uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare q bank_order_activations%rowtype; r bank_qr_test_requests%rowtype;
begin
  if p_request_id is null or p_token is null then raise exception 'bank-invalid-input';end if;
  select * into q from bank_order_activations where request_id=p_request_id and completed_at is null
    and next_attempt_at<=now() and (operation_until is null or operation_until<now()) for update skip locked;
  if not found then return null;end if;
  update bank_order_activations set operation_token=p_token,operation_until=now()+interval '90 seconds',attempts=attempts+1 where request_id=q.request_id;
  select * into r from bank_qr_test_requests where id=q.request_id;
  return jsonb_build_object('requestId',q.request_id,'orderId',r.order_id,'restaurantId',r.restaurant_id);
end $$;
revoke all on function public.claim_baneco_order_activation_for_request(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_baneco_order_activation_for_request(uuid,uuid) to service_role;

-- Serving an open table is distinct from handing over an unpaid counter/pickup
-- order. Rider deliveries retain their own collection workflow.
create function public.guard_cash_collection_before_handoff() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.status='delivered' and old.status is distinct from 'delivered' and new.order_type<>'delivery'
    and new.payment_method='cash' and new.payment_status='pending'
    and not (new.order_type='table' and exists(select 1 from table_visits v where v.id=new.table_visit_id
      and v.restaurant_id=new.restaurant_id and v.table_id=new.table_id and v.status='open')) then
    raise exception 'cash-payment-required' using errcode='22023';
  end if;
  return new;
end $$;
create trigger guard_cash_collection_before_handoff before update of status on public.orders
for each row execute function public.guard_cash_collection_before_handoff();
revoke all on function public.guard_cash_collection_before_handoff() from public,anon,authenticated,service_role;
