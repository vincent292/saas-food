create table if not exists admin_message_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_message_templates_title_length check (char_length(trim(title)) between 2 and 80),
  constraint admin_message_templates_body_length check (char_length(trim(body)) between 2 and 1200)
);

create index if not exists admin_message_templates_active_updated_at_idx
  on admin_message_templates (is_active, updated_at desc);

drop trigger if exists admin_message_templates_updated_at on admin_message_templates;
create trigger admin_message_templates_updated_at
  before update on admin_message_templates
  for each row execute function set_updated_at();

alter table admin_message_templates enable row level security;

drop policy if exists "Superadmins can manage admin message templates" on admin_message_templates;
create policy "Superadmins can manage admin message templates"
  on admin_message_templates
  for all
  using (is_superadmin())
  with check (is_superadmin());
