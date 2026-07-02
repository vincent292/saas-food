create table if not exists restaurant_queue_settings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null unique references restaurants(id) on delete cascade,
  queue_enabled boolean not null default true,
  base_prep_minutes numeric(6,2) not null default 16,
  kitchen_capacity integer not null default 3 check (kitchen_capacity > 0),
  min_estimate_minutes integer not null default 8 check (min_estimate_minutes >= 0),
  max_estimate_minutes integer not null default 75 check (max_estimate_minutes >= min_estimate_minutes),
  weekend_multiplier numeric(5,2) not null default 1.18 check (weekend_multiplier >= 1),
  rush_multiplier numeric(5,2) not null default 1.25 check (rush_multiplier >= 1),
  item_complexity_minutes numeric(5,2) not null default 1.25 check (item_complexity_minutes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists restaurant_demand_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  multiplier numeric(5,2) not null default 1.35 check (multiplier >= 1),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists idx_queue_settings_restaurant on restaurant_queue_settings(restaurant_id);
create index if not exists idx_demand_events_restaurant_time on restaurant_demand_events(restaurant_id, starts_at, ends_at)
where is_active = true;
create index if not exists idx_orders_restaurant_status_started on orders(restaurant_id, status, accepted_at, created_at);
create index if not exists idx_orders_restaurant_ready_history on orders(restaurant_id, ready_at, accepted_at, created_at);

drop trigger if exists restaurant_queue_settings_updated_at on restaurant_queue_settings;
create trigger restaurant_queue_settings_updated_at before update on restaurant_queue_settings for each row execute function set_updated_at();

drop trigger if exists restaurant_demand_events_updated_at on restaurant_demand_events;
create trigger restaurant_demand_events_updated_at before update on restaurant_demand_events for each row execute function set_updated_at();

alter table restaurant_queue_settings enable row level security;
alter table restaurant_demand_events enable row level security;

drop policy if exists "members read queue settings" on restaurant_queue_settings;
create policy "members read queue settings" on restaurant_queue_settings for select using (
  is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier','kitchen','waiter']::app_role[])
);

drop policy if exists "admins manage queue settings" on restaurant_queue_settings;
create policy "admins manage queue settings" on restaurant_queue_settings for all using (
  is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[])
) with check (
  is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[])
);

drop policy if exists "members read demand events" on restaurant_demand_events;
create policy "members read demand events" on restaurant_demand_events for select using (
  is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier','kitchen','waiter']::app_role[])
);

drop policy if exists "admins manage demand events" on restaurant_demand_events;
create policy "admins manage demand events" on restaurant_demand_events for all using (
  is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[])
) with check (
  is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[])
);

create or replace function get_public_order_queue_state(
  p_order_id uuid,
  p_tracking_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_settings record;
  v_started_at timestamptz;
  v_items_count integer := 0;
  v_units_count integer := 0;
  v_history_count integer := 0;
  v_base_prep numeric := 16;
  v_history_avg numeric;
  v_same_type_avg numeric;
  v_slot_avg numeric;
  v_queue_ahead integer := 0;
  v_queue_position integer;
  v_active_orders integer := 0;
  v_preparing_orders integer := 0;
  v_ready_orders integer := 0;
  v_recent_orders integer := 0;
  v_day integer;
  v_hour integer;
  v_is_weekend_like boolean := false;
  v_event_multiplier numeric := 1;
  v_weekend_multiplier numeric := 1;
  v_weekend_setting numeric := 1.18;
  v_load_multiplier numeric := 1;
  v_rush_setting numeric := 1.25;
  v_complexity_minutes numeric := 0;
  v_queue_delay numeric := 0;
  v_elapsed_minutes numeric := 0;
  v_estimated_remaining numeric := 0;
  v_estimated_min integer := 0;
  v_estimated_max integer := 0;
  v_demand_label text := 'Demanda normal';
  v_demand_level text := 'normal';
  v_confidence text := 'low';
  v_enabled boolean := true;
  v_capacity integer := 3;
  v_min_limit integer := 8;
  v_max_limit integer := 75;
  v_item_complexity numeric := 1.25;
begin
  if p_tracking_token is null or length(trim(p_tracking_token)) = 0 then
    return null;
  end if;

  select *
  into v_order
  from orders
  where id = p_order_id
    and tracking_token = p_tracking_token;

  if not found then
    return null;
  end if;

  select *
  into v_settings
  from restaurant_queue_settings
  where restaurant_id = v_order.restaurant_id;

  if found then
    v_enabled := coalesce(v_settings.queue_enabled, true);
    v_base_prep := coalesce(v_settings.base_prep_minutes, 16);
    v_capacity := greatest(coalesce(v_settings.kitchen_capacity, 3), 1);
    v_min_limit := greatest(coalesce(v_settings.min_estimate_minutes, 8), 0);
    v_max_limit := greatest(coalesce(v_settings.max_estimate_minutes, 75), v_min_limit);
    v_weekend_setting := coalesce(v_settings.weekend_multiplier, 1.18);
    v_rush_setting := coalesce(v_settings.rush_multiplier, 1.25);
    v_item_complexity := greatest(coalesce(v_settings.item_complexity_minutes, 1.25), 0);
  end if;

  if not v_enabled then
    return jsonb_build_object(
      'restaurant_id', v_order.restaurant_id,
      'status', v_order.status,
      'queue_enabled', false,
      'updated_at', now()
    );
  end if;

  select count(*), coalesce(sum(quantity), 0)
  into v_items_count, v_units_count
  from order_items
  where order_id = v_order.id;

  select
    count(*),
    avg(extract(epoch from (ready_at - accepted_at)) / 60)
  into v_history_count, v_history_avg
  from orders
  where restaurant_id = v_order.restaurant_id
    and accepted_at is not null
    and ready_at is not null
    and ready_at > accepted_at
    and status in ('ready', 'delivered')
    and created_at >= now() - interval '90 days';

  select avg(extract(epoch from (ready_at - accepted_at)) / 60)
  into v_same_type_avg
  from orders
  where restaurant_id = v_order.restaurant_id
    and order_type = v_order.order_type
    and accepted_at is not null
    and ready_at is not null
    and ready_at > accepted_at
    and status in ('ready', 'delivered')
    and created_at >= now() - interval '90 days';

  v_day := extract(dow from now())::integer;
  v_hour := extract(hour from now())::integer;

  select avg(extract(epoch from (ready_at - accepted_at)) / 60)
  into v_slot_avg
  from orders
  where restaurant_id = v_order.restaurant_id
    and accepted_at is not null
    and ready_at is not null
    and ready_at > accepted_at
    and status in ('ready', 'delivered')
    and created_at >= now() - interval '90 days'
    and extract(dow from created_at)::integer = v_day
    and abs(extract(hour from created_at)::integer - v_hour) <= 1;

  v_base_prep := greatest(
    5,
    coalesce(v_slot_avg * 0.5 + coalesce(v_same_type_avg, v_history_avg, v_base_prep) * 0.5, v_same_type_avg, v_history_avg, v_base_prep)
  );

  v_started_at := coalesce(v_order.accepted_at, v_order.created_at);

  select count(*)
  into v_queue_ahead
  from orders queued
  where queued.restaurant_id = v_order.restaurant_id
    and queued.id <> v_order.id
    and queued.status in ('pending', 'accepted', 'preparing')
    and coalesce(queued.accepted_at, queued.created_at) < v_started_at;

  select
    count(*) filter (where status in ('pending', 'accepted', 'preparing')),
    count(*) filter (where status = 'preparing'),
    count(*) filter (where status = 'ready')
  into v_active_orders, v_preparing_orders, v_ready_orders
  from orders
  where restaurant_id = v_order.restaurant_id
    and status in ('pending', 'accepted', 'preparing', 'ready');

  select count(*)
  into v_recent_orders
  from orders
  where restaurant_id = v_order.restaurant_id
    and status <> 'cancelled'
    and created_at >= now() - interval '20 minutes';

  v_is_weekend_like := v_day in (0, 6) or (v_day = 5 and v_hour >= 18);
  v_weekend_multiplier := case when v_is_weekend_like then v_weekend_setting else 1 end;

  select coalesce(max(multiplier), 1)
  into v_event_multiplier
  from restaurant_demand_events
  where restaurant_id = v_order.restaurant_id
    and is_active = true
    and now() between starts_at and ends_at;

  v_load_multiplier := greatest(
    1,
    case
      when v_active_orders >= v_capacity * 2 or v_recent_orders >= v_capacity * 3 then v_rush_setting
      else 1 + least((v_active_orders::numeric / v_capacity::numeric), 2) * 0.08
    end
  );

  v_complexity_minutes := greatest(v_units_count - 2, 0) * v_item_complexity + greatest(v_items_count - 1, 0) * 0.6;
  v_queue_delay := case
    when v_order.status in ('pending', 'accepted') then (v_queue_ahead::numeric * v_base_prep) / v_capacity::numeric
    when v_order.status = 'preparing' then 0
    else 0
  end;

  v_elapsed_minutes := case
    when v_order.status in ('accepted', 'preparing') then greatest(extract(epoch from (now() - v_started_at)) / 60, 0)
    else 0
  end;

  if v_order.status in ('ready', 'delivered') then
    v_estimated_remaining := 0;
  elsif v_order.status = 'cancelled' then
    v_estimated_remaining := 0;
  else
    v_estimated_remaining := greatest(
      ((v_base_prep + v_complexity_minutes + v_queue_delay) * v_weekend_multiplier * v_event_multiplier * v_load_multiplier) - v_elapsed_minutes,
      2
    );
  end if;

  if v_order.status in ('ready', 'delivered', 'cancelled') then
    v_estimated_min := 0;
    v_estimated_max := 0;
  else
    v_estimated_min := least(greatest(round(v_estimated_remaining * 0.85)::integer, v_min_limit), v_max_limit);
    v_estimated_max := least(greatest(round(v_estimated_remaining * 1.2 + 3)::integer, v_estimated_min + 4), v_max_limit);
  end if;

  v_queue_position := case
    when v_order.status in ('pending', 'accepted') then v_queue_ahead + 1
    when v_order.status = 'preparing' then 1
    else null
  end;

  if v_event_multiplier > 1 then
    v_demand_label := 'Evento de alta demanda';
    v_demand_level := 'event';
  elsif v_active_orders >= v_capacity * 2 or v_recent_orders >= v_capacity * 3 then
    v_demand_label := 'Alta demanda ahora';
    v_demand_level := 'busy';
  elsif v_is_weekend_like then
    v_demand_label := 'Fin de semana movido';
    v_demand_level := 'busy';
  elsif v_active_orders <= 1 and v_recent_orders <= 2 then
    v_demand_label := 'Horario tranquilo';
    v_demand_level := 'calm';
  end if;

  v_confidence := case
    when v_history_count >= 20 then 'high'
    when v_history_count >= 6 then 'medium'
    else 'low'
  end;

  return jsonb_build_object(
    'restaurant_id', v_order.restaurant_id,
    'status', v_order.status,
    'queue_enabled', true,
    'queue_position', v_queue_position,
    'orders_ahead', case when v_order.status in ('pending', 'accepted', 'preparing') then v_queue_ahead else null end,
    'active_orders', v_active_orders,
    'preparing_orders', v_preparing_orders,
    'ready_orders', v_ready_orders,
    'recent_orders', v_recent_orders,
    'estimated_min_minutes', v_estimated_min,
    'estimated_max_minutes', v_estimated_max,
    'estimated_ready_at_min', case when v_estimated_min > 0 then now() + make_interval(mins => v_estimated_min) else null end,
    'estimated_ready_at_max', case when v_estimated_max > 0 then now() + make_interval(mins => v_estimated_max) else null end,
    'demand_label', v_demand_label,
    'demand_level', v_demand_level,
    'confidence', v_confidence,
    'kitchen_capacity', v_capacity,
    'base_prep_minutes', round(v_base_prep, 1),
    'history_sample_size', v_history_count,
    'updated_at', now()
  );
end;
$$;

grant execute on function get_public_order_queue_state(uuid, text) to anon, authenticated;
