alter table owner_platform_billing_settings alter column reminder_days set default 5;
update owner_platform_billing_settings set reminder_days=5 where reminder_days=4;
alter table owner_platform_payment_cycles
  add column if not exists payment_promised_on date,
  add column if not exists payment_promise_note text,
  add column if not exists payment_promise_requested_by uuid references profiles(id),
  add column if not exists payment_promise_requested_at timestamptz,
  add column if not exists payment_promise_status text check (payment_promise_status in ('pending','approved','rejected')),
  add column if not exists payment_promise_reviewed_by uuid references profiles(id),
  add column if not exists payment_promise_reviewed_at timestamptz,
  add column if not exists payment_extension_until date;

-- Called only by authenticated server actions. A proposal is never a payment
-- or an extension; approval is restricted to a verified superadmin actor.
create or replace function resolve_owner_billing_promise(p_cycle_id uuid,p_actor_id uuid,p_action text,p_date date,p_note text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c owner_platform_payment_cycles%rowtype; today date := (clock_timestamp() at time zone 'America/La_Paz')::date;
begin
  select * into c from owner_platform_payment_cycles where id=p_cycle_id for update;
  if not found then raise exception 'billing-cycle-not-found'; end if;
  if p_actor_id is null or not exists(select 1 from profiles where id=p_actor_id) then raise exception 'billing-forbidden'; end if;
  if not exists(select 1 from owner_platform_billing_settings where owner_user_id=c.owner_user_id and next_due_date=c.due_date)
    or c.paid_at is not null or not c.is_billable or c.status='cancelled' then raise exception 'billing-cycle-closed'; end if;
  if p_action='request' then
    if p_actor_id<>c.owner_user_id and not exists(
      select 1 from restaurant_memberships m join restaurants r on r.id=m.restaurant_id
      where m.user_id=p_actor_id and m.is_active and r.owner_user_id=c.owner_user_id and r.deleted_at is null
    ) then raise exception 'billing-forbidden'; end if;
    if p_date is null or p_date<today then raise exception 'billing-invalid-date'; end if;
    update owner_platform_payment_cycles set payment_promised_on=p_date,payment_promise_note=left(p_note,1000),
      payment_promise_requested_by=p_actor_id,payment_promise_requested_at=now(),payment_promise_status='pending',
      payment_promise_reviewed_by=null,payment_promise_reviewed_at=null where id=c.id;
  elsif p_action in ('approve','reject') then
    if not exists(select 1 from profiles where id=p_actor_id and global_role='superadmin') then raise exception 'billing-forbidden'; end if;
    if c.payment_promise_status is distinct from 'pending' then raise exception 'billing-promise-not-pending'; end if;
    if p_action='approve' and (p_date is null or p_date<today) then raise exception 'billing-invalid-date'; end if;
    update owner_platform_payment_cycles set payment_promise_status=case when p_action='approve' then 'approved' else 'rejected' end,
      payment_extension_until=case when p_action='approve' then p_date else payment_extension_until end,
      payment_promise_reviewed_by=p_actor_id,payment_promise_reviewed_at=now() where id=c.id;
  else raise exception 'billing-invalid-action'; end if;
  return jsonb_build_object('ok',true);
end $$;
revoke all on function resolve_owner_billing_promise(uuid,uuid,text,date,text) from public,anon,authenticated;
grant execute on function resolve_owner_billing_promise(uuid,uuid,text,date,text) to service_role;
