alter table multisite_order_children
  add column if not exists pickup_confirmation_code text not null default generate_delivery_confirmation_code(),
  add column if not exists pickup_code_attempts integer not null default 0,
  add column if not exists picked_up_at timestamptz;
alter table multisite_delivery_dispatches
  add column if not exists delivery_confirmation_code text not null default generate_delivery_confirmation_code(),
  add column if not exists delivery_code_attempts integer not null default 0,
  add column if not exists rider_latitude double precision,
  add column if not exists rider_longitude double precision,
  add column if not exists rider_location_updated_at timestamptz;

-- A rider must obtain the final code from the customer, not by reading their
-- own dispatch through PostgREST. Preserve RLS and non-secret column access.
revoke select on multisite_delivery_dispatches from public, anon, authenticated;
do $$
declare visible_columns text;
begin
  select string_agg(quote_ident(attname), ', ' order by attnum) into visible_columns
  from pg_attribute
  where attrelid = 'public.multisite_delivery_dispatches'::regclass
    and attnum > 0 and not attisdropped
    and attname not in ('delivery_confirmation_code', 'delivery_code_attempts');
  execute format('grant select (%s) on public.multisite_delivery_dispatches to authenticated', visible_columns);
end $$;
grant select on multisite_delivery_dispatches to service_role;

-- Use the same lock key as claim_rider_delivery_order, across memberships and
-- both ordinary orders and master routes.
create or replace function guard_rider_route_capacity()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_user uuid;
begin
  if new.restaurant_rider_id is null or new.status not in ('active','arrived') then return new; end if;
  select rider_user_id into v_user from restaurant_riders where id=new.restaurant_rider_id and status='active' and membership_valid_until>=(clock_timestamp() at time zone 'America/La_Paz')::date;
  if not found then raise exception 'rider-membership-inactive'; end if;
  if tg_table_name='multisite_delivery_dispatches' then
    if new.rider_user_id is distinct from v_user then raise exception 'rider-user-mismatch'; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(coalesce(v_user,new.restaurant_rider_id)::text,0));
  if exists(select 1 from multisite_delivery_dispatches d join restaurant_riders r on r.id=d.restaurant_rider_id
    where d.status in ('active','arrived') and (r.rider_user_id=v_user or r.id=new.restaurant_rider_id)
    and (tg_table_name<>'multisite_delivery_dispatches' or d.id<>new.id)) then raise exception 'rider-busy'; end if;
  if exists(select 1 from order_delivery_links l join restaurant_riders r on r.id=l.restaurant_rider_id
    where l.status in ('active','arrived') and l.expires_at>clock_timestamp() and (r.rider_user_id=v_user or r.id=new.restaurant_rider_id)
    and (tg_table_name<>'order_delivery_links' or l.id<>new.id)) then raise exception 'rider-busy'; end if;
  return new;
end;
$$;
drop trigger if exists a_guard_multisite_busy on multisite_delivery_dispatches;
create trigger a_guard_multisite_busy before insert or update of restaurant_rider_id,status on multisite_delivery_dispatches
for each row execute function guard_rider_route_capacity();
drop trigger if exists guard_regular_rider_busy on order_delivery_links;
create trigger guard_regular_rider_busy before insert or update of restaurant_rider_id,status on order_delivery_links
for each row execute function guard_rider_route_capacity();

-- Separate from single-order links: a multi-local needs only one rider.
create or replace function guard_single_dispatch_for_multisite()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from multisite_order_children c join multisite_orders m on m.id=c.multisite_order_id
    where c.order_id=new.order_id and m.status not in ('cancelled','delivered')) then
    raise exception 'multisite-route-dispatch-required';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_single_dispatch_for_multisite on order_delivery_links;
create trigger guard_single_dispatch_for_multisite before insert on order_delivery_links
for each row execute function guard_single_dispatch_for_multisite();
drop trigger if exists guard_single_offer_for_multisite on rider_delivery_offers;
create trigger guard_single_offer_for_multisite before insert on rider_delivery_offers
for each row execute function guard_single_dispatch_for_multisite();

create or replace function ensure_multisite_delivery_code()
returns trigger language plpgsql set search_path=public as $$
begin
  while new.delivery_confirmation_code is null or exists (
    select 1 from multisite_order_children where multisite_order_id=new.multisite_order_id and pickup_confirmation_code=new.delivery_confirmation_code
  ) loop
    new.delivery_confirmation_code:=generate_delivery_confirmation_code();
  end loop;
  return new;
end;
$$;
drop trigger if exists ensure_multisite_delivery_code on multisite_delivery_dispatches;
create trigger ensure_multisite_delivery_code before insert on multisite_delivery_dispatches
for each row execute function ensure_multisite_delivery_code();

create or replace function advance_multisite_delivery(p_order_id uuid, p_rider_user_id uuid, p_action text, p_child_id uuid, p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order multisite_orders%rowtype;
  v_dispatch multisite_delivery_dispatches%rowtype;
  v_child multisite_order_children%rowtype;
  v_next uuid;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_order from multisite_orders where id=p_order_id for update;
  select * into v_dispatch from multisite_delivery_dispatches where multisite_order_id=p_order_id for update;
  if not found or v_dispatch.rider_user_id is distinct from p_rider_user_id or p_rider_user_id is null then
    return jsonb_build_object('ok',false,'error','multisite-dispatch-not-found');
  end if;
  if not exists (select 1 from restaurant_riders where id=v_dispatch.restaurant_rider_id and rider_user_id=p_rider_user_id
    and status='active' and membership_valid_until >= (v_now at time zone 'America/La_Paz')::date) then
    return jsonb_build_object('ok',false,'error','rider-membership-inactive');
  end if;
  if p_action not in ('pickup','delivered') or p_code is null or p_code !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok',false,'error','invalid-confirmation-code');
  end if;
  if p_action='delivered' and v_dispatch.status='delivered' then
    return jsonb_build_object('ok',true,'status','delivered','changed',false);
  end if;
  if v_dispatch.status not in ('active','arrived') or v_order.status not in ('rider_assigned','in_delivery') then
    return jsonb_build_object('ok',false,'error','multisite-route-not-active');
  end if;
  if exists (select 1 from multisite_order_children where multisite_order_id=p_order_id and status='cancelled') then
    return jsonb_build_object('ok',false,'error','multisite-route-needs-review');
  end if;
  if p_action='pickup' then
    select * into v_child from multisite_order_children where id=p_child_id and multisite_order_id=p_order_id for update;
    if not found then return jsonb_build_object('ok',false,'error','multisite-pickup-not-found'); end if;
    if v_child.picked_up_at is not null then return jsonb_build_object('ok',true,'status',v_order.status,'changed',false); end if;
    select id into v_next from multisite_order_children where multisite_order_id=p_order_id and picked_up_at is null order by pickup_position limit 1;
    if v_next<>p_child_id then return jsonb_build_object('ok',false,'error','multisite-pickup-out-of-order'); end if;
    if v_child.status<>'ready' or not exists (select 1 from orders where id=v_child.order_id and status='ready') then
      return jsonb_build_object('ok',false,'error','multisite-pickup-not-ready');
    end if;
    if v_child.pickup_code_attempts>=5 then return jsonb_build_object('ok',false,'error','confirmation-code-locked'); end if;
    if p_code<>v_child.pickup_confirmation_code then
      update multisite_order_children set pickup_code_attempts=pickup_code_attempts+1 where id=v_child.id;
      -- Return, don't raise: attempted-code counters must commit.
      return jsonb_build_object('ok',false,'error','invalid-confirmation-code');
    end if;
    update multisite_order_children set picked_up_at=v_now,pickup_code_attempts=0 where id=v_child.id;
    if not exists (select 1 from multisite_order_children where multisite_order_id=p_order_id and picked_up_at is null) then
      update multisite_delivery_dispatches set status='arrived',arrived_at=coalesce(arrived_at,v_now) where id=v_dispatch.id;
      update multisite_orders set status='in_delivery' where id=p_order_id;
      return jsonb_build_object('ok',true,'status','in_delivery','changed',true);
    end if;
    return jsonb_build_object('ok',true,'status','rider_assigned','changed',true);
  end if;
  if v_dispatch.status<>'arrived' or exists (select 1 from multisite_order_children where multisite_order_id=p_order_id and picked_up_at is null) then
    return jsonb_build_object('ok',false,'error','multisite-pickups-incomplete');
  end if;
  if v_dispatch.delivery_code_attempts>=5 then return jsonb_build_object('ok',false,'error','confirmation-code-locked'); end if;
  if p_code<>v_dispatch.delivery_confirmation_code then
    update multisite_delivery_dispatches set delivery_code_attempts=delivery_code_attempts+1 where id=v_dispatch.id;
    return jsonb_build_object('ok',false,'error','invalid-confirmation-code');
  end if;
  update multisite_delivery_dispatches set status='delivered',delivered_at=v_now,delivery_code_attempts=0 where id=v_dispatch.id;
  update orders set status='delivered',delivered_at=coalesce(delivered_at,v_now)
    where id in (select order_id from multisite_order_children where multisite_order_id=p_order_id) and status<>'delivered';
  update multisite_order_children set status='delivered' where multisite_order_id=p_order_id;
  update multisite_orders set status='delivered' where id=p_order_id;
  -- Delivery does not perform restaurant cash settlement or mark payments paid.
  return jsonb_build_object('ok',true,'status','delivered','changed',true);
end;
$$;
revoke all on function advance_multisite_delivery(uuid,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function advance_multisite_delivery(uuid,uuid,text,uuid,text) to service_role;
