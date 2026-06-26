drop policy if exists "public reads active tables" on tables;
create policy "public reads active tables" on tables
for select
using (
  is_active = true
  or is_superadmin()
  or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier','waiter']::app_role[])
);
