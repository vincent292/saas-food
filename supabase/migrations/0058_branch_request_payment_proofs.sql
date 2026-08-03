create table if not exists platform_branch_request_payment_settings (
  id boolean primary key default true check (id),
  amount numeric(10,2) not null default 199 check (amount >= 0),
  currency text not null default 'BOB',
  qr_url text,
  qr_note text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into platform_branch_request_payment_settings (id, amount, currency)
values (true, 199, 'BOB')
on conflict (id) do nothing;

drop trigger if exists platform_branch_request_payment_settings_updated_at on platform_branch_request_payment_settings;
create trigger platform_branch_request_payment_settings_updated_at
  before update on platform_branch_request_payment_settings
  for each row execute function set_updated_at();

alter table platform_branch_request_payment_settings enable row level security;

drop policy if exists "authenticated read branch request payment settings" on platform_branch_request_payment_settings;
create policy "authenticated read branch request payment settings" on platform_branch_request_payment_settings
  for select to authenticated using (true);

drop policy if exists "superadmin manages branch request payment settings" on platform_branch_request_payment_settings;
create policy "superadmin manages branch request payment settings" on platform_branch_request_payment_settings
  for all using (is_superadmin()) with check (is_superadmin());

grant select on platform_branch_request_payment_settings to authenticated;
grant insert, update on platform_branch_request_payment_settings to authenticated;

alter table owner_branch_capacity_requests
  add column if not exists payment_amount numeric(10,2) not null default 199 check (payment_amount >= 0),
  add column if not exists payment_currency text not null default 'BOB',
  add column if not exists payment_qr_url text,
  add column if not exists payment_qr_note text,
  add column if not exists payment_proof_url text,
  add column if not exists payment_proof_file_name text,
  add column if not exists payment_proof_file_size bigint not null default 0,
  add column if not exists payment_proof_uploaded_at timestamptz;

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
  v_current_limit integer;
begin
  if not is_superadmin() then
    raise exception 'superadmin-required' using errcode = '42501';
  end if;

  select * into v_request
  from owner_branch_capacity_requests
  where id = p_request_id
    and (
      (p_approve and status in ('pending', 'rejected'))
      or (not p_approve and status = 'pending')
    )
  for update;

  if v_request.id is null then
    raise exception 'branch-request-not-found' using errcode = 'P0002';
  end if;

  if p_approve then
    select greatest(v_request.current_limit, coalesce(max(branch_limit), v_request.current_limit))
      into v_current_limit
    from owner_branch_entitlements
    where owner_user_id = v_request.owner_user_id;

    if p_approved_limit is null or p_approved_limit < v_current_limit then
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
