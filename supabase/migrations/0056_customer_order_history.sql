alter table orders
  add column if not exists customer_id uuid references customer_profiles(id) on delete set null;

alter table orders
  add column if not exists customer_phone_normalized text
  generated always as (regexp_replace(coalesce(customer_phone, ''), '\D', '', 'g')) stored;

create index if not exists orders_customer_id_created_idx
  on orders (customer_id, created_at desc);

create index if not exists orders_customer_phone_created_idx
  on orders (customer_phone_normalized, created_at desc);

update orders o
set customer_id = p.id
from customer_profiles p
where o.customer_id is null
  and length(o.customer_phone_normalized) >= 6
  and o.customer_phone_normalized = p.phone_normalized;

drop policy if exists "customers read own orders" on orders;
create policy "customers read own orders" on orders
  for select using (customer_id = auth.uid());
