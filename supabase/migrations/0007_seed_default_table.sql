insert into tables (restaurant_id, name, code, status, capacity, is_active)
select restaurants.id, 'Mesa 1', 'MESA-1', 'available', 4, true
from restaurants
where restaurants.status = 'active'
  and not exists (
    select 1
    from tables
    where tables.restaurant_id = restaurants.id
      and upper(tables.code) = 'MESA-1'
  );
