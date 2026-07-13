create table if not exists restaurant_announcements (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  type text not null default 'announcement' check (type in ('announcement', 'closure')),
  title text not null,
  body text,
  image_url text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_restaurant_announcements_public
  on restaurant_announcements (restaurant_id, is_active, starts_at, ends_at);

drop trigger if exists restaurant_announcements_updated_at on restaurant_announcements;
create trigger restaurant_announcements_updated_at
  before update on restaurant_announcements
  for each row execute function set_updated_at();

alter table restaurant_announcements enable row level security;

drop policy if exists "public reads active restaurant announcements" on restaurant_announcements;
create policy "public reads active restaurant announcements" on restaurant_announcements
  for select using (
    is_active is true
    or is_superadmin()
    or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier','kitchen','waiter']::app_role[])
  );

drop policy if exists "admins manage restaurant announcements" on restaurant_announcements;
create policy "admins manage restaurant announcements" on restaurant_announcements
  for all using (
    is_superadmin()
    or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[])
  )
  with check (
    is_superadmin()
    or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[])
  );
