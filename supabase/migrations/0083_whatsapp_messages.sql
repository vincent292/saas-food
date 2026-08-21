create table if not exists whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  message_id text not null unique check (message_id <> ''),
  from_phone text not null check (from_phone <> ''),
  to_phone_number_id text,
  to_display_phone text,
  contact_name text,
  message_type text not null default 'unknown',
  message_text text,
  payload jsonb not null default '{}'::jsonb,
  whatsapp_timestamp timestamptz,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_messages_from_received
  on whatsapp_messages(from_phone, received_at desc);

create index if not exists idx_whatsapp_messages_received
  on whatsapp_messages(received_at desc);

create index if not exists idx_whatsapp_messages_type
  on whatsapp_messages(message_type);

alter table whatsapp_messages enable row level security;

revoke all on whatsapp_messages from anon, authenticated;
grant select, insert, update on whatsapp_messages to service_role;
