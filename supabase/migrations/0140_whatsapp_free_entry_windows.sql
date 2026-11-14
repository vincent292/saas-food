-- Only signed Meta delivery events establish a free entry point window.
-- Browser referral parameters never grant free/extended messaging.
create table public.whatsapp_free_entry_windows (
  phone_number_id text not null,
  customer_phone text not null,
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  expires_at timestamptz not null,
  message_id text not null,
  updated_at timestamptz not null default now(),
  primary key (phone_number_id, customer_phone)
);
alter table public.whatsapp_free_entry_windows enable row level security;
revoke all on public.whatsapp_free_entry_windows from anon, authenticated;
grant select, insert, update, delete on public.whatsapp_free_entry_windows to service_role;
