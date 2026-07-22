create table if not exists owner_branch_capacity_requests (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  source_restaurant_id uuid not null references restaurants(id) on delete cascade,
  requested_additional integer not null default 1 check (requested_additional between 1 and 20),
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  current_limit integer not null check (current_limit >= 1),
  approved_limit integer check (approved_limit >= 1),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_owner_branch_capacity_requests_one_pending
  on owner_branch_capacity_requests(owner_user_id)
  where status = 'pending';

create index if not exists idx_owner_branch_capacity_requests_restaurant
  on owner_branch_capacity_requests(source_restaurant_id, created_at desc);

drop trigger if exists owner_branch_capacity_requests_updated_at on owner_branch_capacity_requests;
create trigger owner_branch_capacity_requests_updated_at
  before update on owner_branch_capacity_requests
  for each row execute function set_updated_at();

alter table owner_branch_capacity_requests enable row level security;

drop policy if exists "owners read branch capacity requests" on owner_branch_capacity_requests;
create policy "owners read branch capacity requests" on owner_branch_capacity_requests
  for select using (owner_user_id = auth.uid() or is_superadmin());

drop policy if exists "owners create branch capacity requests" on owner_branch_capacity_requests;
create policy "owners create branch capacity requests" on owner_branch_capacity_requests
  for insert to authenticated
  with check (
    owner_user_id = auth.uid()
    and exists (
      select 1
      from restaurants r
      where r.id = source_restaurant_id
        and r.owner_user_id = auth.uid()
        and r.deleted_at is null
    )
  );

drop policy if exists "superadmin manages branch capacity requests" on owner_branch_capacity_requests;
create policy "superadmin manages branch capacity requests" on owner_branch_capacity_requests
  for all using (is_superadmin()) with check (is_superadmin());

grant select, insert on owner_branch_capacity_requests to authenticated;
grant select, insert, update on owner_branch_capacity_requests to service_role;

create or replace function resolve_owner_branch_capacity_request(
  p_request_id uuid,
  p_approve boolean,
  p_approved_limit integer default null,
  p_resolution_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request owner_branch_capacity_requests%rowtype;
begin
  if not is_superadmin() then
    raise exception 'superadmin-required' using errcode = '42501';
  end if;

  select * into v_request
  from owner_branch_capacity_requests
  where id = p_request_id
    and status = 'pending'
  for update;

  if v_request.id is null then
    raise exception 'branch-request-not-found' using errcode = 'P0002';
  end if;

  if p_approve then
    if p_approved_limit is null or p_approved_limit < v_request.current_limit then
      raise exception 'invalid-approved-limit' using errcode = '22023';
    end if;

    insert into owner_branch_entitlements (owner_user_id, branch_limit, created_by, updated_by)
    values (v_request.owner_user_id, p_approved_limit, auth.uid(), auth.uid())
    on conflict (owner_user_id) do update set
      branch_limit = excluded.branch_limit,
      updated_by = auth.uid(),
      updated_at = now();
  end if;

  update owner_branch_capacity_requests
  set
    status = case when p_approve then 'approved' else 'rejected' end,
    approved_limit = case when p_approve then p_approved_limit else null end,
    resolved_by = auth.uid(),
    resolved_at = now(),
    resolution_notes = nullif(trim(coalesce(p_resolution_notes, '')), '')
  where id = v_request.id;
end;
$$;

revoke all on function resolve_owner_branch_capacity_request(uuid, boolean, integer, text) from public, anon;
grant execute on function resolve_owner_branch_capacity_request(uuid, boolean, integer, text) to authenticated;
