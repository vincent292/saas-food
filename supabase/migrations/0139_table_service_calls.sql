create table public.table_service_calls(
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  table_id uuid not null references public.tables(id) on delete restrict,
  request_id uuid not null unique,
  tracking_token text not null default replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),
  assigned_waiter_id uuid references public.profiles(id) on delete set null,
  status text not null default 'pending' check(status in ('pending','attended','expired')),
  attended_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),attended_at timestamptz,
  notification_claimed_at timestamptz
);
create unique index one_pending_table_service_call on public.table_service_calls(table_id) where status='pending';
create index table_service_calls_restaurant on public.table_service_calls(restaurant_id,created_at desc);
alter table public.table_service_calls enable row level security;
revoke all on public.table_service_calls from public,anon,authenticated;
grant all on public.table_service_calls to service_role;
-- Tokens are capabilities and must never be streamed in staff row changes.
create function public.broadcast_table_service_call() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  perform realtime.send(jsonb_build_object('changed',true),'changed','table-service:'||new.restaurant_id::text,true);
  return null;
end $$;
create trigger broadcast_table_service_call after insert or update on public.table_service_calls for each row execute function public.broadcast_table_service_call();
create policy table_service_staff_broadcast on realtime.messages for select to authenticated using(
  extension='broadcast' and realtime.topic() like 'table-service:%' and exists(
    select 1 from public.restaurants r where 'table-service:'||r.id::text=realtime.topic() and
      (is_superadmin() or has_restaurant_role(r.id,array['restaurant_admin','cashier','waiter']::app_role[]))));

create function public.request_table_service(p_restaurant uuid,p_table uuid,p_request uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare call table_service_calls%rowtype; waiter uuid; latest timestamptz;
begin
  if p_request is null or not exists(select 1 from tables t join restaurants r on r.id=t.restaurant_id
    join restaurant_settings s on s.restaurant_id=r.id where t.id=p_table and r.id=p_restaurant and t.is_active
    and r.status='active' and r.deleted_at is null and s.table_orders_enabled) then raise exception 'table-unavailable';end if;
  if not exists(select 1 from cash_sessions where restaurant_id=p_restaurant and status='open') then raise exception 'table-service-closed';end if;
  perform pg_advisory_xact_lock(hashtextextended('table-service:'||p_table::text,0));
  update table_service_calls set status='expired' where table_id=p_table and status='pending' and created_at<now()-interval '15 minutes';
  select * into call from table_service_calls where request_id=p_request;
  if found then
    if call.restaurant_id<>p_restaurant or call.table_id<>p_table then raise exception 'table-unavailable';end if;
    return jsonb_build_object('call',to_jsonb(call),'created',false);
  end if;
  select * into call from table_service_calls where table_id=p_table and status='pending';
  if found then return jsonb_build_object('call',to_jsonb(call),'created',false);end if;
  select max(created_at) into latest from table_service_calls where table_id=p_table;
  if latest>now()-interval '2 minutes' then raise exception 'table-call-cooldown';end if;
  select a.waiter_user_id into waiter from waiter_table_assignments a
    join restaurant_memberships m on m.user_id=a.waiter_user_id and m.restaurant_id=a.restaurant_id and m.is_active and m.role='waiter'
    where a.restaurant_id=p_restaurant and a.table_id=p_table;
  if waiter is null then
    select audit.actor_user_id into waiter from admin_audit_logs audit
      join orders o on o.id=audit.entity_id
      join table_visits visit on visit.id=o.table_visit_id and visit.status='open'
      join restaurant_memberships m on m.user_id=audit.actor_user_id and m.restaurant_id=o.restaurant_id and m.is_active and m.role='waiter'
      where audit.action='waiter_order_created' and audit.restaurant_id=p_restaurant and o.table_id=p_table
      order by audit.created_at desc,audit.id desc limit 1;
  end if;
  insert into table_service_calls(restaurant_id,table_id,request_id,assigned_waiter_id)
    values(p_restaurant,p_table,p_request,waiter) returning * into call;
  return jsonb_build_object('call',to_jsonb(call),'created',true);
end $$;

create function public.attend_table_service(p_restaurant uuid,p_call uuid,p_actor uuid) returns boolean
language plpgsql security definer set search_path=public as $$
declare call table_service_calls%rowtype; manager boolean; shift_action text;
begin
  if exists(select 1 from support_impersonation_sessions where actor_user_id=p_actor and status='active' and expires_at>now()) then raise exception 'table-service-forbidden';end if;
  manager:=exists(select 1 from profiles where id=p_actor and global_role='superadmin') or exists(
    select 1 from restaurant_memberships where restaurant_id=p_restaurant and user_id=p_actor and is_active and role in ('restaurant_admin','cashier'));
  select * into call from table_service_calls where restaurant_id=p_restaurant and id=p_call for update;
  if not found then raise exception 'table-service-forbidden';end if;
  if not manager then
    if call.assigned_waiter_id is distinct from p_actor or not exists(select 1 from restaurant_memberships
      where restaurant_id=p_restaurant and user_id=p_actor and is_active and role='waiter') then raise exception 'table-service-forbidden';end if;
    select action into shift_action from admin_audit_logs where restaurant_id=p_restaurant and actor_user_id=p_actor
      and action in ('waiter_shift_opened','waiter_shift_closed') order by created_at desc,id desc limit 1;
    if shift_action is distinct from 'waiter_shift_opened' then raise exception 'table-service-forbidden';end if;
  end if;
  if call.status<>'pending' then return call.status='attended';end if;
  update table_service_calls set status='attended',attended_by=p_actor,attended_at=now() where id=call.id;
  return true;
end $$;
revoke all on function public.broadcast_table_service_call(),public.request_table_service(uuid,uuid,uuid),public.attend_table_service(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.request_table_service(uuid,uuid,uuid),public.attend_table_service(uuid,uuid,uuid) to service_role;
