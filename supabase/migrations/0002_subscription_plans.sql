do $$ begin
  create type subscription_status as enum ('trialing', 'active', 'past_due', 'cancelled');
exception when duplicate_object then null;
end $$;

create table if not exists subscription_plans (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  price_monthly numeric(12,2) not null default 0,
  max_restaurants integer not null default 1,
  max_users_per_restaurant integer not null default 3,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists plan_modules (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references subscription_plans(id) on delete cascade,
  module_key text not null,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (plan_id, module_key)
);

create table if not exists restaurant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  plan_id uuid not null references subscription_plans(id),
  status subscription_status not null default 'trialing',
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_restaurant_subscriptions_active
  on restaurant_subscriptions(restaurant_id)
  where status in ('trialing', 'active', 'past_due');

drop trigger if exists subscription_plans_updated_at on subscription_plans;
create trigger subscription_plans_updated_at before update on subscription_plans for each row execute function set_updated_at();
drop trigger if exists restaurant_subscriptions_updated_at on restaurant_subscriptions;
create trigger restaurant_subscriptions_updated_at before update on restaurant_subscriptions for each row execute function set_updated_at();

alter table subscription_plans enable row level security;
alter table plan_modules enable row level security;
alter table restaurant_subscriptions enable row level security;

drop policy if exists "authenticated reads active plans" on subscription_plans;
create policy "authenticated reads active plans" on subscription_plans for select using (is_active = true or is_superadmin());
drop policy if exists "superadmin manages plans" on subscription_plans;
create policy "superadmin manages plans" on subscription_plans for all using (is_superadmin()) with check (is_superadmin());

drop policy if exists "authenticated reads plan modules" on plan_modules;
create policy "authenticated reads plan modules" on plan_modules for select using (true);
drop policy if exists "superadmin manages plan modules" on plan_modules;
create policy "superadmin manages plan modules" on plan_modules for all using (is_superadmin()) with check (is_superadmin());

drop policy if exists "members read restaurant subscription" on restaurant_subscriptions;
create policy "members read restaurant subscription" on restaurant_subscriptions for select using (
  is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier','kitchen','waiter']::app_role[])
);
drop policy if exists "superadmin manages restaurant subscriptions" on restaurant_subscriptions;
create policy "superadmin manages restaurant subscriptions" on restaurant_subscriptions for all using (is_superadmin()) with check (is_superadmin());

insert into subscription_plans (key, name, description, price_monthly, max_restaurants, max_users_per_restaurant)
values
  ('basic', 'Básico', 'Menú público, productos y pedidos simples.', 99, 1, 3),
  ('pro', 'Pro', 'Mesas QR, cocina y caja/POS para operación diaria.', 199, 2, 8),
  ('premium', 'Premium', 'Inventario, reportes y multiusuario avanzado.', 349, 5, 20)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  price_monthly = excluded.price_monthly,
  max_restaurants = excluded.max_restaurants,
  max_users_per_restaurant = excluded.max_users_per_restaurant;

with plan_rows as (
  select id, key from subscription_plans
),
module_rows as (
  select id as plan_id, unnest(
    case key
      when 'basic' then array['public_menu','orders']
      when 'pro' then array['public_menu','orders','table_qr','kitchen','cash']
      else array['public_menu','orders','table_qr','kitchen','cash','inventory','reports','multi_user']
    end
  ) as module_key
  from plan_rows
)
insert into plan_modules (plan_id, module_key, is_enabled)
select plan_id, module_key, true from module_rows
on conflict (plan_id, module_key) do update set is_enabled = excluded.is_enabled;
