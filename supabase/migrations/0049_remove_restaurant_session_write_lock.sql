-- Restaurant access sessions are monitoring-only. Authorization continues to be
-- enforced by RLS and the role checks inside transactional RPCs.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'restaurant_settings',
    'categories',
    'products',
    'product_variants',
    'product_option_groups',
    'product_options',
    'tables',
    'payment_methods',
    'cash_sessions',
    'cash_movements',
    'inventory_items',
    'inventory_movements',
    'business_hours',
    'module_settings',
    'inventory_suppliers',
    'product_ingredients',
    'inventory_counts',
    'inventory_count_lines',
    'inventory_categories',
    'inventory_zones',
    'inventory_item_zones',
    'product_suppliers'
  ]
  loop
    if to_regclass('public.' || v_table) is not null then
      execute format('drop trigger if exists enforce_single_restaurant_access_%I on %I', v_table, v_table);
    end if;
  end loop;
end $$;

create or replace function enforce_single_restaurant_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

update restaurant_access_sessions
set
  status = 'released',
  released_at = coalesce(released_at, now()),
  release_reason = coalesce(release_reason, 'Bloqueo operativo retirado')
where status = 'active';
