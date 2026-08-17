alter table order_delivery_links
  add column if not exists restaurant_rider_id uuid references restaurant_riders(id) on delete set null;

create index if not exists idx_delivery_links_restaurant_rider
  on order_delivery_links(restaurant_rider_id, status, created_at desc)
  where restaurant_rider_id is not null;

create index if not exists idx_delivery_links_available_orders
  on order_delivery_links(order_id, status, expires_at);
