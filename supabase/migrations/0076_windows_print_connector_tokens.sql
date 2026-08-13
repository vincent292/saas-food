create table if not exists restaurant_print_connectors (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  token text not null unique,
  linked_at timestamptz,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  revoked_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_print_connectors_restaurant_unique unique (restaurant_id)
);

create index if not exists idx_restaurant_print_connectors_token
  on restaurant_print_connectors(token)
  where revoked_at is null;

drop trigger if exists restaurant_print_connectors_updated_at on restaurant_print_connectors;
create trigger restaurant_print_connectors_updated_at
  before update on restaurant_print_connectors
  for each row execute function set_updated_at();

alter table restaurant_print_connectors enable row level security;

drop policy if exists "admins read print connectors" on restaurant_print_connectors;
create policy "admins read print connectors"
  on restaurant_print_connectors
  for select
  using (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[]));

drop policy if exists "admins manage print connectors" on restaurant_print_connectors;
create policy "admins manage print connectors"
  on restaurant_print_connectors
  for all
  using (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[]))
  with check (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[]));
