alter table orders
  add column if not exists accepted_at timestamptz,
  add column if not exists preparing_at timestamptz,
  add column if not exists ready_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists printed_at timestamptz;

update orders
set accepted_at = coalesce(accepted_at, updated_at)
where status in ('accepted', 'preparing', 'ready', 'delivered')
  and accepted_at is null;

update orders
set preparing_at = coalesce(preparing_at, updated_at)
where status in ('preparing', 'ready', 'delivered')
  and preparing_at is null;

update orders
set ready_at = coalesce(ready_at, updated_at)
where status in ('ready', 'delivered')
  and ready_at is null;

update orders
set delivered_at = coalesce(delivered_at, updated_at)
where status = 'delivered'
  and delivered_at is null;

update orders
set cancelled_at = coalesce(cancelled_at, updated_at)
where status = 'cancelled'
  and cancelled_at is null;

alter table restaurant_settings
  add column if not exists print_format text not null default 'thermal_80',
  add column if not exists auto_print_kitchen boolean not null default false,
  add column if not exists print_logo boolean not null default true;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table orders;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'order_items'
  ) then
    alter publication supabase_realtime add table order_items;
  end if;
end $$;
