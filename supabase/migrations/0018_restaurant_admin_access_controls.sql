alter table restaurants
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null,
  add column if not exists owner_name text,
  add column if not exists owner_email text,
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivated_by uuid references auth.users(id) on delete set null,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null,
  add column if not exists restored_at timestamptz,
  add column if not exists restored_by uuid references auth.users(id) on delete set null;

create index if not exists idx_restaurants_deleted_status on restaurants(deleted_at, status);
create index if not exists idx_restaurants_owner on restaurants(owner_user_id);

create or replace function has_restaurant_role(target_restaurant_id uuid, allowed_roles app_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from restaurant_memberships rm
    join restaurants r on r.id = rm.restaurant_id
    where rm.restaurant_id = target_restaurant_id
      and rm.user_id = auth.uid()
      and rm.is_active = true
      and rm.role = any(allowed_roles)
      and r.status = 'active'
      and r.deleted_at is null
  );
$$;

drop policy if exists "public reads active restaurants" on restaurants;
create policy "public reads active restaurants" on restaurants
for select using (
  (status = 'active' and deleted_at is null)
  or is_superadmin()
  or has_restaurant_role(id, array['restaurant_admin','cashier','kitchen','waiter']::app_role[])
);

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
end;
$$;
