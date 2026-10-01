-- An occupied table represents a visit, not merely a table id.  This keeps a
-- new group of guests separate from the prior account on the same table.
create table if not exists table_visits (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  table_id uuid not null references tables(id) on delete restrict,
  status text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  opened_by uuid references auth.users(id),
  opened_at timestamptz not null default now(),
  closed_by uuid references auth.users(id),
  closed_at timestamptz,
  notes text,
  check ((status = 'open' and closed_at is null) or status <> 'open')
);

create unique index if not exists one_open_visit_per_table
  on table_visits(table_id) where status = 'open';
create index if not exists idx_table_visits_restaurant_open
  on table_visits(restaurant_id, opened_at desc);

alter table orders add column if not exists table_visit_id uuid references table_visits(id) on delete set null;
create index if not exists idx_orders_table_visit on orders(table_visit_id);

-- Existing active table orders are grouped as the current visit.  Historical
-- delivered orders are intentionally left untouched so reports stay stable.
insert into table_visits (restaurant_id, table_id, opened_at)
select o.restaurant_id, o.table_id, min(o.created_at)
from orders o
where o.order_type = 'table' and o.table_id is not null
  and o.status in ('pending', 'accepted', 'preparing', 'ready')
  and not exists (select 1 from table_visits v where v.table_id = o.table_id and v.status = 'open')
group by o.restaurant_id, o.table_id;

update orders o set table_visit_id = v.id
from table_visits v
where o.order_type = 'table' and o.table_id = v.table_id and v.status = 'open'
  and o.status in ('pending', 'accepted', 'preparing', 'ready') and o.table_visit_id is null;

create or replace function link_table_order_to_open_visit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_visit_id uuid;
begin
  if new.order_type <> 'table' or new.table_id is null or new.table_visit_id is not null then return new; end if;
  select id into v_visit_id from table_visits
  where restaurant_id = new.restaurant_id and table_id = new.table_id and status = 'open'
  for update;
  if v_visit_id is null then
    insert into table_visits (restaurant_id, table_id, opened_by) values (new.restaurant_id, new.table_id, auth.uid()) returning id into v_visit_id;
  end if;
  new.table_visit_id := v_visit_id;
  return new;
end;
$$;
drop trigger if exists orders_link_table_visit on orders;
create trigger orders_link_table_visit before insert on orders for each row execute function link_table_order_to_open_visit();

create table if not exists waiter_table_assignments (
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  table_id uuid not null references tables(id) on delete cascade,
  waiter_user_id uuid not null references auth.users(id) on delete cascade,
  assigned_by uuid references auth.users(id),
  assigned_at timestamptz not null default now(),
  primary key (restaurant_id, table_id)
);
alter table table_visits enable row level security;
alter table waiter_table_assignments enable row level security;
create policy "restaurant staff view table visits" on table_visits for select using (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier','waiter']::app_role[]));
create policy "cashiers manage table visits" on table_visits for all using (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier']::app_role[])) with check (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier']::app_role[]));
create policy "staff view waiter assignments" on waiter_table_assignments for select using (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier','waiter']::app_role[]));
create policy "cashiers manage waiter assignments" on waiter_table_assignments for all using (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier']::app_role[])) with check (is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier']::app_role[]));
