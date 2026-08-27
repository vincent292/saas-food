create table if not exists platform_whatsapp_settings (
  id text primary key default 'default',
  bot_enabled boolean not null default true,
  response_tone text not null default 'friendly',
  welcome_message text,
  restaurant_picker_message text,
  fallback_message text,
  human_handoff_message text,
  draft_timeout_minutes integer not null default 20,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_whatsapp_settings_singleton
    check (id = 'default'),
  constraint platform_whatsapp_settings_tone_check
    check (response_tone in ('friendly', 'direct', 'formal')),
  constraint platform_whatsapp_settings_welcome_length
    check (welcome_message is null or char_length(trim(welcome_message)) between 2 and 600),
  constraint platform_whatsapp_settings_picker_length
    check (restaurant_picker_message is null or char_length(trim(restaurant_picker_message)) between 2 and 600),
  constraint platform_whatsapp_settings_fallback_length
    check (fallback_message is null or char_length(trim(fallback_message)) between 2 and 600),
  constraint platform_whatsapp_settings_handoff_length
    check (human_handoff_message is null or char_length(trim(human_handoff_message)) between 2 and 600),
  constraint platform_whatsapp_settings_timeout_check
    check (draft_timeout_minutes between 5 and 120)
);

insert into platform_whatsapp_settings (id)
values ('default')
on conflict (id) do nothing;

drop trigger if exists platform_whatsapp_settings_updated_at on platform_whatsapp_settings;
create trigger platform_whatsapp_settings_updated_at
  before update on platform_whatsapp_settings
  for each row execute function set_updated_at();

alter table platform_whatsapp_settings enable row level security;

drop policy if exists "superadmin manages platform whatsapp settings" on platform_whatsapp_settings;
create policy "superadmin manages platform whatsapp settings"
  on platform_whatsapp_settings
  for all
  using (is_superadmin())
  with check (is_superadmin());

grant select, insert, update on platform_whatsapp_settings to authenticated, service_role;
