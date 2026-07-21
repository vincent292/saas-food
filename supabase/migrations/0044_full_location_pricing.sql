alter table subscription_plans
  add column if not exists additional_restaurant_price_monthly numeric(12,2) not null default 299;

update subscription_plans
set
  is_active = false
where key in ('basic', 'pro');

insert into subscription_plans (
  key,
  name,
  description,
  price_monthly,
  additional_restaurant_price_monthly,
  max_restaurants,
  max_users_per_restaurant,
  is_active
)
values (
  'premium',
  'Full',
  'Todo incluido. La primera sucursal cuesta Bs 450/mes y cada sucursal adicional Bs 299/mes.',
  450,
  299,
  1,
  20,
  true
)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  price_monthly = excluded.price_monthly,
  additional_restaurant_price_monthly = excluded.additional_restaurant_price_monthly,
  max_users_per_restaurant = excluded.max_users_per_restaurant,
  is_active = true,
  updated_at = now();

with full_plan as (
  select id from subscription_plans where key = 'premium'
),
full_modules as (
  select id as plan_id, unnest(array[
    'public_menu',
    'orders',
    'table_qr',
    'kitchen',
    'cash',
    'inventory',
    'reports',
    'multi_user'
  ]) as module_key
  from full_plan
)
insert into plan_modules (plan_id, module_key, is_enabled)
select plan_id, module_key, true from full_modules
on conflict (plan_id, module_key) do update set is_enabled = true;

update plan_modules
set is_enabled = true
where plan_id in (select id from subscription_plans where key = 'premium');

update restaurant_subscriptions
set plan_id = (select id from subscription_plans where key = 'premium' limit 1)
where status in ('trialing', 'active', 'past_due');

update restaurant_settings
set
  delivery_enabled = true,
  pickup_enabled = true,
  table_orders_enabled = true,
  inventory_enabled = true,
  cash_enabled = true,
  kitchen_enabled = true;

insert into module_settings (restaurant_id, module_key, is_enabled)
select restaurants.id, module_key, true
from restaurants
cross join unnest(array[
  'public_menu',
  'orders',
  'table_qr',
  'kitchen',
  'cash',
  'inventory',
  'reports',
  'multi_user'
]) as module_keys(module_key)
where restaurants.deleted_at is null
on conflict (restaurant_id, module_key) do update set is_enabled = true;
