drop policy if exists "public creates orders" on orders;
create policy "public creates orders"
on orders
for insert
to anon, authenticated
with check (true);

drop policy if exists "public creates order items" on order_items;
create policy "public creates order items"
on order_items
for insert
to anon, authenticated
with check (true);
