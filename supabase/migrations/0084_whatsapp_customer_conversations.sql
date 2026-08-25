create table if not exists whatsapp_customers (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique check (phone <> ''),
  display_name text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references whatsapp_customers(id) on delete cascade,
  from_phone text not null unique check (from_phone <> ''),
  restaurant_id uuid references restaurants(id) on delete set null,
  state text not null default 'idle' check (state in ('idle', 'choosing_restaurant', 'browsing_menu', 'drafting_order', 'handoff')),
  last_intent text,
  last_message_id text,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists whatsapp_order_drafts (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references whatsapp_conversations(id) on delete cascade,
  customer_id uuid not null references whatsapp_customers(id) on delete cascade,
  restaurant_id uuid references restaurants(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'ready_to_confirm', 'converted', 'abandoned')),
  items jsonb not null default '[]'::jsonb,
  customer_name text,
  customer_address text,
  order_type text check (order_type in ('delivery', 'pickup')),
  notes text,
  created_order_id uuid references orders(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_customers_last_seen
  on whatsapp_customers(last_seen_at desc);

create index if not exists idx_whatsapp_conversations_restaurant_state
  on whatsapp_conversations(restaurant_id, state, updated_at desc);

create index if not exists idx_whatsapp_order_drafts_conversation_status
  on whatsapp_order_drafts(conversation_id, status, updated_at desc);

drop trigger if exists whatsapp_customers_updated_at on whatsapp_customers;
create trigger whatsapp_customers_updated_at
  before update on whatsapp_customers
  for each row execute function set_updated_at();

drop trigger if exists whatsapp_conversations_updated_at on whatsapp_conversations;
create trigger whatsapp_conversations_updated_at
  before update on whatsapp_conversations
  for each row execute function set_updated_at();

drop trigger if exists whatsapp_order_drafts_updated_at on whatsapp_order_drafts;
create trigger whatsapp_order_drafts_updated_at
  before update on whatsapp_order_drafts
  for each row execute function set_updated_at();

alter table whatsapp_customers enable row level security;
alter table whatsapp_conversations enable row level security;
alter table whatsapp_order_drafts enable row level security;

revoke all on whatsapp_customers from anon, authenticated;
revoke all on whatsapp_conversations from anon, authenticated;
revoke all on whatsapp_order_drafts from anon, authenticated;

grant select, insert, update on whatsapp_customers to service_role;
grant select, insert, update on whatsapp_conversations to service_role;
grant select, insert, update on whatsapp_order_drafts to service_role;
