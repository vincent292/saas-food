-- One official Cloud API / Business App coexistence connection per branch.
-- Credentials and onboarding sessions are server-only, never exposed via RLS.
create table public.restaurant_whatsapp_connections (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  phone_number_id text not null unique check (phone_number_id ~ '^[0-9]+$'),
  waba_id text not null check (waba_id ~ '^[0-9]+$'),
  display_phone_number text not null,
  verified_name text,
  token_ciphertext text,
  token_expires_at timestamptz,
  status text not null default 'pending' check (status in ('pending','connected','disconnected','needs_reconnect')),
  coexistence boolean not null default true,
  connected_by uuid references auth.users(id),
  connected_at timestamptz,
  last_checked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.whatsapp_onboarding_sessions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.restaurant_whatsapp_connections enable row level security;
alter table public.whatsapp_onboarding_sessions enable row level security;
revoke all on public.restaurant_whatsapp_connections, public.whatsapp_onboarding_sessions from anon, authenticated;
grant select, insert, update, delete on public.restaurant_whatsapp_connections, public.whatsapp_onboarding_sessions to service_role;
create trigger restaurant_whatsapp_connections_updated_at before update on public.restaurant_whatsapp_connections
  for each row execute function public.set_updated_at();

-- Keep channel ownership stable even if two onboarding sessions race.
create function public.protect_whatsapp_connection_number() returns trigger language plpgsql set search_path = public as $$
begin
  if new.phone_number_id <> old.phone_number_id or new.restaurant_id <> old.restaurant_id then
    raise exception 'whatsapp-channel-ownership-is-immutable';
  end if;
  return new;
end;
$$;
create trigger restaurant_whatsapp_connection_ownership before update on public.restaurant_whatsapp_connections
  for each row execute function public.protect_whatsapp_connection_number();

-- A customer can talk to several branch numbers simultaneously. Preserve the
-- historic central channel as 'platform'; never assign it to a branch number.
alter table public.whatsapp_conversations
  add column channel_key text not null default 'platform',
  add column last_customer_message_at timestamptz;
alter table public.whatsapp_conversations drop constraint if exists whatsapp_conversations_from_phone_key;
create unique index whatsapp_conversations_channel_customer_key on public.whatsapp_conversations(channel_key, from_phone);
-- Meta may deliver events out of order. Human/API replies must not extend the
-- customer service window, and an older customer message must not shorten it.
create function public.preserve_whatsapp_customer_window() returns trigger language plpgsql set search_path = public as $$
begin
  new.last_customer_message_at := greatest(old.last_customer_message_at, new.last_customer_message_at);
  return new;
end;
$$;
create trigger whatsapp_customer_window before update on public.whatsapp_conversations
  for each row execute function public.preserve_whatsapp_customer_window();
alter table public.whatsapp_messages
  add column conversation_id uuid references public.whatsapp_conversations(id) on delete set null;
create index whatsapp_messages_conversation_received_idx on public.whatsapp_messages(conversation_id, received_at desc);

-- Attach old messages only when their destination channel can be identified.
update public.whatsapp_messages as m
set conversation_id = c.id
from public.whatsapp_conversations as c
where c.from_phone = m.from_phone and c.channel_key = 'platform';
update public.whatsapp_conversations as c
set last_customer_message_at = (
  select max(coalesce(m.whatsapp_timestamp, m.received_at))
  from public.whatsapp_messages as m
  where m.conversation_id = c.id and coalesce(m.payload->>'direction', 'inbound') = 'inbound'
);

-- Bind order notifications to the channel on which the order was placed.
-- This also survives connecting/disconnecting a branch number later.
create table public.whatsapp_order_channels (
  order_id uuid primary key references public.orders(id) on delete cascade,
  conversation_id uuid not null references public.whatsapp_conversations(id),
  channel_key text not null,
  restaurant_id uuid not null references public.restaurants(id)
);
alter table public.whatsapp_order_channels enable row level security;
revoke all on public.whatsapp_order_channels from anon, authenticated;
grant select, insert, update on public.whatsapp_order_channels to service_role;

create function public.bind_whatsapp_order_channel() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.order_origin = 'phone_whatsapp' then
    insert into whatsapp_order_channels(order_id, conversation_id, channel_key, restaurant_id)
    select new.id, c.id, c.channel_key, new.restaurant_id
    from whatsapp_order_drafts d join whatsapp_conversations c on c.id = d.conversation_id
    where d.id = new.public_request_id and d.restaurant_id = new.restaurant_id
    on conflict (order_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.bind_whatsapp_order_channel() from public, anon, authenticated;
create trigger orders_bind_whatsapp_channel after insert on public.orders for each row execute function public.bind_whatsapp_order_channel();
insert into public.whatsapp_order_channels(order_id, conversation_id, channel_key, restaurant_id)
select d.created_order_id, c.id, c.channel_key, d.restaurant_id
from public.whatsapp_order_drafts d join public.whatsapp_conversations c on c.id = d.conversation_id
where d.created_order_id is not null and d.restaurant_id is not null
on conflict (order_id) do nothing;
