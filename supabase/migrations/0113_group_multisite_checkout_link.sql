-- Group sessions can now collect items from more than one restaurant and link
-- their final checkout to the existing multi-commerce master order.
alter table group_order_sessions
  add column if not exists submitted_multisite_order_id uuid references multisite_orders(id) on delete set null;

create index if not exists group_order_sessions_submitted_multisite_idx
  on group_order_sessions (submitted_multisite_order_id)
  where submitted_multisite_order_id is not null;

alter table group_order_items
  add column if not exists restaurant_id uuid references restaurants(id) on delete restrict;

update group_order_items item
   set restaurant_id = session.restaurant_id
  from group_order_sessions session
 where item.session_id = session.id
   and item.restaurant_id is null;

alter table group_order_items
  alter column restaurant_id set not null;

create index if not exists group_order_items_session_restaurant_idx
  on group_order_items (session_id, restaurant_id, created_at);
