alter table orders
  add column if not exists group_order_session_id uuid references group_order_sessions(id) on delete set null;

create index if not exists orders_group_order_session_idx
  on orders (group_order_session_id);

alter table group_order_sessions
  add column if not exists submitted_snapshot jsonb not null default '{}'::jsonb;
