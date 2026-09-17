create table if not exists restaurant_pos_push_tokens (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  expo_push_token text not null,
  device_id text,
  platform text,
  app_version text,
  is_enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  last_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_pos_push_tokens_restaurant_token_unique
    unique (restaurant_id, expo_push_token)
);

create index if not exists idx_restaurant_pos_push_tokens_restaurant
  on restaurant_pos_push_tokens(restaurant_id)
  where is_enabled = true;

alter table restaurant_pos_push_tokens enable row level security;

