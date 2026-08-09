create table if not exists group_order_sessions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  public_token text not null unique,
  host_access_token text not null unique,
  host_participant_id uuid,
  host_name text not null,
  host_phone text,
  collect_mode text not null default 'host_collects' check (collect_mode in ('host_collects', 'restaurant_collects', 'internal_cash')),
  host_qr_url text,
  status text not null default 'open' check (status in ('open', 'locked', 'submitted', 'cancelled', 'expired')),
  submitted_order_id uuid references orders(id) on delete set null,
  submitted_at timestamptz,
  subtotal numeric(12, 2) not null default 0,
  delivery_fee numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  expires_at timestamptz not null default (now() + interval '12 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint group_order_sessions_host_name_length check (char_length(trim(host_name)) between 2 and 120)
);

create table if not exists group_order_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references group_order_sessions(id) on delete cascade,
  participant_token text not null unique,
  display_name text not null,
  phone text,
  role text not null default 'guest' check (role in ('host', 'guest')),
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid_qr', 'cash_pending', 'covered_by_host', 'excluded')),
  payment_method payment_method_type,
  payment_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint group_order_participants_display_name_length check (char_length(trim(display_name)) between 2 and 120)
);

alter table group_order_sessions
  add constraint group_order_sessions_host_participant_fk
  foreign key (host_participant_id) references group_order_participants(id) on delete set null;

create table if not exists group_order_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references group_order_sessions(id) on delete cascade,
  participant_id uuid not null references group_order_participants(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  product_name text not null,
  variant_id uuid references product_variants(id) on delete set null,
  option_ids uuid[] not null default '{}'::uuid[],
  unit_price numeric(12, 2) not null default 0,
  quantity integer not null default 1 check (quantity > 0),
  subtotal numeric(12, 2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists group_order_sessions_restaurant_status_idx
  on group_order_sessions (restaurant_id, status, created_at desc);

create index if not exists group_order_participants_session_idx
  on group_order_participants (session_id, created_at);

create index if not exists group_order_items_session_idx
  on group_order_items (session_id, created_at);

drop trigger if exists group_order_sessions_updated_at on group_order_sessions;
create trigger group_order_sessions_updated_at
  before update on group_order_sessions
  for each row execute function set_updated_at();

drop trigger if exists group_order_participants_updated_at on group_order_participants;
create trigger group_order_participants_updated_at
  before update on group_order_participants
  for each row execute function set_updated_at();

drop trigger if exists group_order_items_updated_at on group_order_items;
create trigger group_order_items_updated_at
  before update on group_order_items
  for each row execute function set_updated_at();

alter table group_order_sessions enable row level security;
alter table group_order_participants enable row level security;
alter table group_order_items enable row level security;

drop policy if exists "Superadmins can manage group order sessions" on group_order_sessions;
create policy "Superadmins can manage group order sessions"
  on group_order_sessions
  for all
  using (is_superadmin())
  with check (is_superadmin());

drop policy if exists "Superadmins can manage group order participants" on group_order_participants;
create policy "Superadmins can manage group order participants"
  on group_order_participants
  for all
  using (is_superadmin())
  with check (is_superadmin());

drop policy if exists "Superadmins can manage group order items" on group_order_items;
create policy "Superadmins can manage group order items"
  on group_order_items
  for all
  using (is_superadmin())
  with check (is_superadmin());
