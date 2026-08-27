create table if not exists restaurant_whatsapp_bot_settings (
  restaurant_id uuid primary key references restaurants(id) on delete cascade,
  bot_enabled boolean not null default true,
  response_tone text not null default 'friendly',
  greeting_message text,
  menu_intro_message text,
  checkout_message text,
  location_request_message text,
  qr_payment_message text,
  receipt_request_message text,
  fallback_message text,
  human_handoff_message text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_whatsapp_bot_settings_tone_check
    check (response_tone in ('friendly', 'direct', 'formal')),
  constraint restaurant_whatsapp_bot_settings_greeting_length
    check (greeting_message is null or char_length(trim(greeting_message)) between 2 and 600),
  constraint restaurant_whatsapp_bot_settings_menu_intro_length
    check (menu_intro_message is null or char_length(trim(menu_intro_message)) between 2 and 600),
  constraint restaurant_whatsapp_bot_settings_checkout_length
    check (checkout_message is null or char_length(trim(checkout_message)) between 2 and 240),
  constraint restaurant_whatsapp_bot_settings_location_length
    check (location_request_message is null or char_length(trim(location_request_message)) between 2 and 400),
  constraint restaurant_whatsapp_bot_settings_qr_length
    check (qr_payment_message is null or char_length(trim(qr_payment_message)) between 2 and 400),
  constraint restaurant_whatsapp_bot_settings_receipt_length
    check (receipt_request_message is null or char_length(trim(receipt_request_message)) between 2 and 300),
  constraint restaurant_whatsapp_bot_settings_fallback_length
    check (fallback_message is null or char_length(trim(fallback_message)) between 2 and 600),
  constraint restaurant_whatsapp_bot_settings_handoff_length
    check (human_handoff_message is null or char_length(trim(human_handoff_message)) between 2 and 600)
);

drop trigger if exists restaurant_whatsapp_bot_settings_updated_at on restaurant_whatsapp_bot_settings;
create trigger restaurant_whatsapp_bot_settings_updated_at
  before update on restaurant_whatsapp_bot_settings
  for each row execute function set_updated_at();

alter table restaurant_whatsapp_bot_settings enable row level security;

drop policy if exists "members manage restaurant whatsapp bot settings" on restaurant_whatsapp_bot_settings;
create policy "members manage restaurant whatsapp bot settings"
  on restaurant_whatsapp_bot_settings
  for all
  using (
    is_superadmin()
    or has_restaurant_role(restaurant_id, array['restaurant_admin', 'cashier']::app_role[])
  )
  with check (
    is_superadmin()
    or has_restaurant_role(restaurant_id, array['restaurant_admin', 'cashier']::app_role[])
  );

grant select, insert, update on restaurant_whatsapp_bot_settings to authenticated, service_role;
