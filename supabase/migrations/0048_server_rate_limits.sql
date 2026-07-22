create table if not exists request_rate_limits (
  scope text not null,
  identifier_hash text not null,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 1 check (attempts >= 0),
  blocked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (scope, identifier_hash)
);

alter table request_rate_limits enable row level security;
revoke all on request_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on request_rate_limits to service_role;

create or replace function consume_request_rate_limit(
  p_scope text,
  p_identifier_hash text,
  p_max_attempts integer,
  p_window_seconds integer,
  p_block_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit request_rate_limits%rowtype;
  v_inserted integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service-role-required' using errcode = '42501';
  end if;

  if coalesce(trim(p_scope), '') = ''
    or coalesce(trim(p_identifier_hash), '') = ''
    or p_max_attempts < 1
    or p_window_seconds < 1
    or p_block_seconds < 1 then
    raise exception 'invalid-rate-limit' using errcode = '22023';
  end if;

  insert into request_rate_limits (scope, identifier_hash, attempts)
  values (p_scope, p_identifier_hash, 1)
  on conflict (scope, identifier_hash) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 1 then
    return true;
  end if;

  select * into v_limit
  from request_rate_limits
  where scope = p_scope and identifier_hash = p_identifier_hash
  for update;

  if v_limit.blocked_until is not null and v_limit.blocked_until > now() then
    return false;
  end if;

  if v_limit.window_started_at <= now() - make_interval(secs => p_window_seconds) then
    update request_rate_limits
    set window_started_at = now(), attempts = 1, blocked_until = null, updated_at = now()
    where scope = p_scope and identifier_hash = p_identifier_hash;
    return true;
  end if;

  if v_limit.attempts >= p_max_attempts then
    update request_rate_limits
    set blocked_until = now() + make_interval(secs => p_block_seconds), updated_at = now()
    where scope = p_scope and identifier_hash = p_identifier_hash;
    return false;
  end if;

  update request_rate_limits
  set attempts = attempts + 1, updated_at = now()
  where scope = p_scope and identifier_hash = p_identifier_hash;
  return true;
end;
$$;

create or replace function clear_request_rate_limit(p_scope text, p_identifier_hash text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service-role-required' using errcode = '42501';
  end if;

  delete from request_rate_limits where scope = p_scope and identifier_hash = p_identifier_hash;
end;
$$;

revoke all on function consume_request_rate_limit(text, text, integer, integer, integer) from public, anon, authenticated;
revoke all on function clear_request_rate_limit(text, text) from public, anon, authenticated;
grant execute on function consume_request_rate_limit(text, text, integer, integer, integer) to service_role;
grant execute on function clear_request_rate_limit(text, text) to service_role;
