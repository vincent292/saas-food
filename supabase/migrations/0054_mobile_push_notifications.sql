create table if not exists mobile_push_tokens (
  id uuid primary key default gen_random_uuid(),
  expo_push_token text not null unique,
  customer_phone text,
  device_id text,
  platform text,
  app_version text,
  is_enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists mobile_order_push_tokens (
  order_id uuid not null references orders(id) on delete cascade,
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  expo_push_token text not null references mobile_push_tokens(expo_push_token) on delete cascade,
  customer_phone text,
  last_notified_status text,
  last_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (order_id, expo_push_token)
);

create table if not exists mobile_push_notification_logs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  restaurant_id uuid references restaurants(id) on delete set null,
  expo_push_token text,
  event_type text not null default 'order_status',
  status text,
  title text not null,
  body text not null,
  expo_ticket_id text,
  response_status text,
  response_payload jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_mobile_order_push_tokens_order
  on mobile_order_push_tokens(order_id);

create index if not exists idx_mobile_order_push_tokens_restaurant
  on mobile_order_push_tokens(restaurant_id);

create index if not exists idx_mobile_push_notification_logs_order
  on mobile_push_notification_logs(order_id, created_at desc);

alter table mobile_push_tokens enable row level security;
alter table mobile_order_push_tokens enable row level security;
alter table mobile_push_notification_logs enable row level security;
