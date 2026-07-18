alter table orders
  add column if not exists invoice_issued_at timestamptz,
  add column if not exists invoice_issued_by uuid references auth.users(id) on delete set null,
  add column if not exists invoice_number text,
  add column if not exists invoice_notes text;

create index if not exists idx_orders_invoice_requests
  on orders(restaurant_id, invoice_required, invoice_issued_at, created_at desc)
  where invoice_required = true;

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
begin
  if v_user_id is null then
    raise exception 'session-required' using errcode = '42501';
  end if;

  select name into v_restaurant_name
  from restaurants
  where id = p_restaurant_id
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

  perform expire_stale_restaurant_access_sessions();

  update restaurant_access_sessions
  set
    ip_address = nullif(p_ip_address, ''),
    user_agent = nullif(p_user_agent, ''),
    role = v_role,
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
    on conflict (user_id, restaurant_id)
    where status = 'active'
    do update set
      ip_address = excluded.ip_address,
      user_agent = excluded.user_agent,
      role = excluded.role,
      last_seen_at = now(),
      expires_at = now() + interval '30 minutes'
    returning id into v_session_id;

    perform write_admin_audit(
      'restaurant_access_seen',
      'restaurant_access_session',
      v_session_id,
      p_restaurant_id,
      'info',
      p_ip_address,
      p_user_agent,
      jsonb_build_object('role', v_role, 'mode', 'monitoring_only')
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
  message := 'restaurant-session-monitored';
  return next;
end;
$$;

grant execute on function claim_restaurant_access_session(uuid, text, text) to authenticated;
