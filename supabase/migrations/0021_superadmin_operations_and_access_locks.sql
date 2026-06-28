create table if not exists admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text,
  restaurant_id uuid references restaurants(id) on delete set null,
  restaurant_name_snapshot text,
  action text not null,
  entity_type text not null default 'platform',
  entity_id uuid,
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists support_tickets (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references restaurants(id) on delete set null,
  restaurant_name_snapshot text,
  title text not null,
  description text,
  category text not null default 'other' check (category in ('access', 'billing', 'orders', 'cash', 'inventory', 'incident', 'other')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'waiting_customer', 'resolved', 'closed')),
  created_by uuid references auth.users(id) on delete set null,
  assigned_to uuid references auth.users(id) on delete set null,
  resolved_by uuid references auth.users(id) on delete set null,
  first_response_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists platform_incidents (
  id uuid primary key default gen_random_uuid(),
  affected_restaurant_id uuid references restaurants(id) on delete set null,
  affected_restaurant_snapshot text,
  title text not null,
  description text,
  impact_area text not null default 'platform' check (impact_area in ('platform', 'public_menu', 'orders', 'cash', 'kitchen', 'inventory', 'storage', 'supabase', 'other')),
  severity text not null default 'minor' check (severity in ('minor', 'major', 'critical')),
  status text not null default 'investigating' check (status in ('investigating', 'identified', 'monitoring', 'resolved')),
  reported_by uuid references auth.users(id) on delete set null,
  resolved_by uuid references auth.users(id) on delete set null,
  started_at timestamptz not null default now(),
  resolved_at timestamptz,
  postmortem text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists restaurant_access_sessions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  ip_address text,
  user_agent text,
  status text not null default 'active' check (status in ('active', 'released', 'expired', 'blocked')),
  opened_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes',
  released_at timestamptz,
  release_reason text
);

create index if not exists idx_admin_audit_logs_created on admin_audit_logs(created_at desc);
create index if not exists idx_admin_audit_logs_restaurant on admin_audit_logs(restaurant_id, created_at desc);
create index if not exists idx_support_tickets_status on support_tickets(status, priority, created_at desc);
create index if not exists idx_support_tickets_restaurant on support_tickets(restaurant_id, created_at desc);
create index if not exists idx_platform_incidents_status on platform_incidents(status, severity, created_at desc);
create index if not exists idx_restaurant_access_sessions_active_user on restaurant_access_sessions(user_id, status, expires_at);
create unique index if not exists idx_restaurant_access_sessions_one_active_target
  on restaurant_access_sessions(user_id, restaurant_id)
  where status = 'active';

drop trigger if exists support_tickets_updated_at on support_tickets;
create trigger support_tickets_updated_at before update on support_tickets for each row execute function set_updated_at();

drop trigger if exists platform_incidents_updated_at on platform_incidents;
create trigger platform_incidents_updated_at before update on platform_incidents for each row execute function set_updated_at();

alter table admin_audit_logs enable row level security;
alter table support_tickets enable row level security;
alter table platform_incidents enable row level security;
alter table restaurant_access_sessions enable row level security;

drop policy if exists "superadmin reads audit logs" on admin_audit_logs;
create policy "superadmin reads audit logs" on admin_audit_logs for select using (is_superadmin());

drop policy if exists "authenticated writes audit logs" on admin_audit_logs;
create policy "authenticated writes audit logs" on admin_audit_logs for insert to authenticated with check (actor_user_id = auth.uid() or is_superadmin());

drop policy if exists "superadmin manages support tickets" on support_tickets;
create policy "superadmin manages support tickets" on support_tickets for all using (is_superadmin()) with check (is_superadmin());

drop policy if exists "members read support tickets" on support_tickets;
create policy "members read support tickets" on support_tickets for select using (
  is_superadmin()
  or (restaurant_id is not null and has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[]))
);

drop policy if exists "superadmin manages platform incidents" on platform_incidents;
create policy "superadmin manages platform incidents" on platform_incidents for all using (is_superadmin()) with check (is_superadmin());

drop policy if exists "members read platform incidents" on platform_incidents;
create policy "members read platform incidents" on platform_incidents for select using (
  is_superadmin()
  or (affected_restaurant_id is not null and has_restaurant_role(affected_restaurant_id, array['restaurant_admin','cashier','kitchen','waiter']::app_role[]))
);

drop policy if exists "users read own access sessions" on restaurant_access_sessions;
create policy "users read own access sessions" on restaurant_access_sessions for select using (is_superadmin() or user_id = auth.uid());

drop policy if exists "users update own access sessions" on restaurant_access_sessions;
create policy "users update own access sessions" on restaurant_access_sessions for update using (is_superadmin() or user_id = auth.uid()) with check (is_superadmin() or user_id = auth.uid());

create or replace function write_admin_audit(
  p_action text,
  p_entity_type text default 'platform',
  p_entity_id uuid default null,
  p_restaurant_id uuid default null,
  p_severity text default 'info',
  p_ip_address text default null,
  p_user_agent text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log_id uuid;
  v_actor_email text;
  v_restaurant_name text;
begin
  select email into v_actor_email from profiles where id = auth.uid();
  select name into v_restaurant_name from restaurants where id = p_restaurant_id;

  insert into admin_audit_logs (
    actor_user_id,
    actor_email,
    restaurant_id,
    restaurant_name_snapshot,
    action,
    entity_type,
    entity_id,
    severity,
    ip_address,
    user_agent,
    metadata
  )
  values (
    auth.uid(),
    v_actor_email,
    p_restaurant_id,
    v_restaurant_name,
    p_action,
    coalesce(nullif(p_entity_type, ''), 'platform'),
    p_entity_id,
    case when p_severity in ('info', 'warning', 'critical') then p_severity else 'info' end,
    nullif(p_ip_address, ''),
    nullif(p_user_agent, ''),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_log_id;

  return v_log_id;
end;
$$;

grant execute on function write_admin_audit(text, text, uuid, uuid, text, text, text, jsonb) to authenticated;

create or replace function expire_stale_restaurant_access_sessions()
returns void
language sql
security definer
set search_path = public
as $$
  update restaurant_access_sessions
  set
    status = 'expired',
    released_at = now(),
    release_reason = coalesce(release_reason, 'Vencida por inactividad')
  where status = 'active'
    and expires_at < now();
$$;

grant execute on function expire_stale_restaurant_access_sessions() to authenticated;

create or replace function claim_restaurant_access_session(
  p_restaurant_id uuid,
  p_ip_address text default null,
  p_user_agent text default null
)
returns table (
  allowed boolean,
  session_id uuid,
  restaurant_id uuid,
  restaurant_name text,
  active_restaurant_id uuid,
  active_restaurant_name text,
  active_ip_address text,
  active_last_seen_at timestamptz,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role app_role;
  v_restaurant_name text;
  v_session_id uuid;
  v_conflict restaurant_access_sessions%rowtype;
  v_conflict_restaurant_name text;
begin
  if v_user_id is null then
    raise exception 'session-required' using errcode = '42501';
  end if;

  select name into v_restaurant_name
  from restaurants
  where id = p_restaurant_id
    and status = 'active'
    and deleted_at is null;

  if v_restaurant_name is null then
    raise exception 'restaurant-not-active' using errcode = '42501';
  end if;

  if is_superadmin() then
    allowed := true;
    session_id := null;
    restaurant_id := p_restaurant_id;
    restaurant_name := v_restaurant_name;
    active_restaurant_id := null;
    active_restaurant_name := null;
    active_ip_address := null;
    active_last_seen_at := null;
    message := 'superadmin-bypass';
    return next;
    return;
  end if;

  select rm.role into v_role
  from restaurant_memberships rm
  where rm.restaurant_id = p_restaurant_id
    and rm.user_id = v_user_id
    and rm.is_active = true
  order by case rm.role when 'restaurant_admin' then 1 when 'cashier' then 2 when 'kitchen' then 3 when 'waiter' then 4 else 5 end
  limit 1;

  if v_role is null then
    raise exception 'restaurant-access-denied' using errcode = '42501';
  end if;

  if v_role not in ('restaurant_admin', 'cashier') then
    allowed := true;
    session_id := null;
    restaurant_id := p_restaurant_id;
    restaurant_name := v_restaurant_name;
    active_restaurant_id := null;
    active_restaurant_name := null;
    active_ip_address := null;
    active_last_seen_at := null;
    message := 'role-not-restricted';
    return next;
    return;
  end if;

  perform expire_stale_restaurant_access_sessions();

  select ras.* into v_conflict
  from restaurant_access_sessions ras
  where ras.user_id = v_user_id
    and ras.status = 'active'
    and ras.expires_at >= now()
    and ras.restaurant_id <> p_restaurant_id
  order by ras.last_seen_at desc
  limit 1;

  if v_conflict.id is not null then
    select name into v_conflict_restaurant_name from restaurants where id = v_conflict.restaurant_id;

    perform write_admin_audit(
      'restaurant_access_blocked',
      'restaurant_access_session',
      v_conflict.id,
      p_restaurant_id,
      'warning',
      p_ip_address,
      p_user_agent,
      jsonb_build_object('active_restaurant_id', v_conflict.restaurant_id, 'active_restaurant_name', v_conflict_restaurant_name)
    );

    allowed := false;
    session_id := v_conflict.id;
    restaurant_id := p_restaurant_id;
    restaurant_name := v_restaurant_name;
    active_restaurant_id := v_conflict.restaurant_id;
    active_restaurant_name := v_conflict_restaurant_name;
    active_ip_address := v_conflict.ip_address;
    active_last_seen_at := v_conflict.last_seen_at;
    message := 'restaurant-session-conflict';
    return next;
    return;
  end if;

  update restaurant_access_sessions
  set
    ip_address = nullif(p_ip_address, ''),
    user_agent = nullif(p_user_agent, ''),
    last_seen_at = now(),
    expires_at = now() + interval '30 minutes'
  where user_id = v_user_id
    and restaurant_id = p_restaurant_id
    and status = 'active'
  returning id into v_session_id;

  if v_session_id is null then
    insert into restaurant_access_sessions (
      restaurant_id,
      user_id,
      role,
      ip_address,
      user_agent
    )
    values (
      p_restaurant_id,
      v_user_id,
      v_role,
      nullif(p_ip_address, ''),
      nullif(p_user_agent, '')
    )
    returning id into v_session_id;

    perform write_admin_audit(
      'restaurant_access_claimed',
      'restaurant_access_session',
      v_session_id,
      p_restaurant_id,
      'info',
      p_ip_address,
      p_user_agent,
      jsonb_build_object('role', v_role)
    );
  end if;

  allowed := true;
  session_id := v_session_id;
  restaurant_id := p_restaurant_id;
  restaurant_name := v_restaurant_name;
  active_restaurant_id := null;
  active_restaurant_name := null;
  active_ip_address := null;
  active_last_seen_at := null;
  message := 'restaurant-session-active';
  return next;
end;
$$;

grant execute on function claim_restaurant_access_session(uuid, text, text) to authenticated;

create or replace function release_restaurant_access_session(
  p_restaurant_id uuid,
  p_reason text default 'Liberada por el usuario'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
begin
  if auth.uid() is null then
    raise exception 'session-required' using errcode = '42501';
  end if;

  update restaurant_access_sessions
  set
    status = 'released',
    released_at = now(),
    release_reason = coalesce(nullif(p_reason, ''), 'Liberada por el usuario')
  where user_id = auth.uid()
    and restaurant_id = p_restaurant_id
    and status = 'active'
  returning id into v_session_id;

  if v_session_id is not null then
    perform write_admin_audit('restaurant_access_released', 'restaurant_access_session', v_session_id, p_restaurant_id, 'info', null, null, jsonb_build_object('reason', p_reason));
  end if;
end;
$$;

grant execute on function release_restaurant_access_session(uuid, text) to authenticated;

create or replace function release_restaurant_access_session_by_id(
  p_session_id uuid,
  p_reason text default 'Liberada por superadmin'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session restaurant_access_sessions%rowtype;
begin
  select * into v_session
  from restaurant_access_sessions
  where id = p_session_id
  for update;

  if v_session.id is null then
    raise exception 'session-not-found' using errcode = 'P0002';
  end if;

  if not is_superadmin() and v_session.user_id <> auth.uid() then
    raise exception 'superadmin-required' using errcode = '42501';
  end if;

  update restaurant_access_sessions
  set
    status = 'released',
    released_at = now(),
    release_reason = coalesce(nullif(p_reason, ''), 'Liberada por superadmin')
  where id = p_session_id
    and status = 'active';

  perform write_admin_audit('restaurant_access_force_released', 'restaurant_access_session', p_session_id, v_session.restaurant_id, 'warning', null, null, jsonb_build_object('reason', p_reason));
end;
$$;

grant execute on function release_restaurant_access_session_by_id(uuid, text) to authenticated;

create or replace function release_all_restaurant_access_sessions(
  p_reason text default 'Cierre de sesion'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  update restaurant_access_sessions
  set
    status = 'released',
    released_at = now(),
    release_reason = coalesce(nullif(p_reason, ''), 'Cierre de sesion')
  where user_id = auth.uid()
    and status = 'active';
end;
$$;

grant execute on function release_all_restaurant_access_sessions(text) to authenticated;

create or replace function enforce_single_restaurant_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant_id uuid;
  v_role app_role;
  v_session restaurant_access_sessions%rowtype;
begin
  if auth.uid() is null or is_superadmin() then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  v_restaurant_id := coalesce(new.restaurant_id, old.restaurant_id);

  if v_restaurant_id is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  select rm.role into v_role
  from restaurant_memberships rm
  where rm.restaurant_id = v_restaurant_id
    and rm.user_id = auth.uid()
    and rm.is_active = true
  order by case rm.role when 'restaurant_admin' then 1 when 'cashier' then 2 when 'kitchen' then 3 when 'waiter' then 4 else 5 end
  limit 1;

  if v_role not in ('restaurant_admin', 'cashier') then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  perform expire_stale_restaurant_access_sessions();

  select ras.* into v_session
  from restaurant_access_sessions ras
  where ras.user_id = auth.uid()
    and ras.status = 'active'
    and ras.expires_at >= now()
    and ras.restaurant_id <> v_restaurant_id
  order by ras.last_seen_at desc
  limit 1;

  if v_session.id is not null then
    raise exception 'restaurant-session-conflict' using errcode = '42501';
  end if;

  select ras.* into v_session
  from restaurant_access_sessions ras
  where ras.user_id = auth.uid()
    and ras.status = 'active'
    and ras.expires_at >= now()
    and ras.restaurant_id = v_restaurant_id
  order by ras.last_seen_at desc
  limit 1;

  if v_session.id is null then
    raise exception 'restaurant-session-required' using errcode = '42501';
  end if;

  update restaurant_access_sessions
  set
    last_seen_at = now(),
    expires_at = now() + interval '30 minutes'
  where id = v_session.id;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'restaurant_settings',
    'categories',
    'products',
    'product_variants',
    'product_option_groups',
    'product_options',
    'tables',
    'payment_methods',
    'cash_sessions',
    'cash_movements',
    'inventory_items',
    'inventory_movements',
    'business_hours',
    'module_settings',
    'inventory_suppliers',
    'product_ingredients',
    'inventory_counts',
    'inventory_count_lines',
    'inventory_categories',
    'inventory_zones',
    'inventory_item_zones',
    'product_suppliers'
  ]
  loop
    execute format('drop trigger if exists enforce_single_restaurant_access_%I on %I', v_table, v_table);
    execute format('create trigger enforce_single_restaurant_access_%I before insert or update or delete on %I for each row execute function enforce_single_restaurant_access()', v_table, v_table);
  end loop;
end $$;

create or replace function set_restaurant_status(
  p_restaurant_id uuid,
  p_status restaurant_status
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_superadmin() then
    raise exception 'superadmin-required' using errcode = '42501';
  end if;

  update restaurants
  set
    status = p_status,
    deactivated_at = case when p_status = 'active' then null else now() end,
    deactivated_by = case when p_status = 'active' then null else auth.uid() end,
    updated_at = now()
  where id = p_restaurant_id
    and deleted_at is null;

  if p_status <> 'active' then
    update restaurant_access_sessions
    set status = 'released', released_at = now(), release_reason = 'Restaurante suspendido o inactivo'
    where restaurant_id = p_restaurant_id and status = 'active';
  end if;

  perform write_admin_audit('restaurant_status_changed', 'restaurant', p_restaurant_id, p_restaurant_id, 'warning', null, null, jsonb_build_object('status', p_status));
end;
$$;

create or replace function archive_restaurant(
  p_restaurant_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_superadmin() then
    raise exception 'superadmin-required' using errcode = '42501';
  end if;

  update restaurants
  set
    status = 'inactive',
    deleted_at = now(),
    deleted_by = auth.uid(),
    deactivated_at = coalesce(deactivated_at, now()),
    deactivated_by = coalesce(deactivated_by, auth.uid()),
    updated_at = now()
  where id = p_restaurant_id
    and deleted_at is null;

  update restaurant_access_sessions
  set status = 'released', released_at = now(), release_reason = 'Restaurante archivado'
  where restaurant_id = p_restaurant_id and status = 'active';

  perform write_admin_audit('restaurant_archived', 'restaurant', p_restaurant_id, p_restaurant_id, 'critical');
end;
$$;

create or replace function restore_restaurant(
  p_restaurant_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_superadmin() then
    raise exception 'superadmin-required' using errcode = '42501';
  end if;

  update restaurants
  set
    status = 'active',
    deleted_at = null,
    deleted_by = null,
    restored_at = now(),
    restored_by = auth.uid(),
    deactivated_at = null,
    deactivated_by = null,
    updated_at = now()
  where id = p_restaurant_id;

  perform write_admin_audit('restaurant_restored', 'restaurant', p_restaurant_id, p_restaurant_id, 'warning');
end;
$$;

create or replace function permanently_delete_restaurant(
  p_restaurant_id uuid,
  p_confirmation_slug text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant restaurants%rowtype;
begin
  if not is_superadmin() then
    raise exception 'superadmin-required' using errcode = '42501';
  end if;

  select * into v_restaurant
  from restaurants
  where id = p_restaurant_id
  for update;

  if v_restaurant.id is null then
    raise exception 'restaurant-not-found' using errcode = 'P0002';
  end if;

  if v_restaurant.deleted_at is null then
    raise exception 'archive-required' using errcode = 'P0001';
  end if;

  if v_restaurant.slug <> p_confirmation_slug then
    raise exception 'confirmation-mismatch' using errcode = '22023';
  end if;

  perform write_admin_audit(
    'restaurant_permanently_deleted',
    'restaurant',
    p_restaurant_id,
    p_restaurant_id,
    'critical',
    null,
    null,
    jsonb_build_object('slug', v_restaurant.slug, 'name', v_restaurant.name)
  );

  update restaurant_access_sessions
  set status = 'released', released_at = now(), release_reason = 'Restaurante eliminado definitivamente'
  where restaurant_id = p_restaurant_id and status = 'active';

  delete from restaurants where id = p_restaurant_id;
end;
$$;

grant execute on function set_restaurant_status(uuid, restaurant_status) to authenticated;
grant execute on function archive_restaurant(uuid) to authenticated;
grant execute on function restore_restaurant(uuid) to authenticated;
grant execute on function permanently_delete_restaurant(uuid, text) to authenticated;
