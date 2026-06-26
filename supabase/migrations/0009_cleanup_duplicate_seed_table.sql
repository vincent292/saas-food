update tables seeded_table
set is_active = false
where upper(seeded_table.code) = 'MESA-1'
  and not exists (
    select 1
    from orders
    where orders.table_id = seeded_table.id
  )
  and exists (
    select 1
    from tables existing_table
    where existing_table.restaurant_id = seeded_table.restaurant_id
      and existing_table.id <> seeded_table.id
      and existing_table.is_active = true
      and upper(existing_table.code) = 'MESA-01'
  );
