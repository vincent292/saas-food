alter table group_order_sessions
  add column if not exists multisite_enabled boolean not null default false,
  add column if not exists multisite_radius_km numeric(6, 2) not null default 3,
  add column if not exists multisite_max_pickups integer not null default 3;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'group_order_sessions_multisite_radius_check'
  ) then
    alter table group_order_sessions
      add constraint group_order_sessions_multisite_radius_check check (multisite_radius_km > 0 and multisite_radius_km <= 10);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'group_order_sessions_multisite_max_pickups_check'
  ) then
    alter table group_order_sessions
      add constraint group_order_sessions_multisite_max_pickups_check check (multisite_max_pickups between 1 and 5);
  end if;
end $$;

create index if not exists group_order_sessions_multisite_idx
  on group_order_sessions (multisite_enabled, status, created_at desc);
