create table if not exists restaurant_whatsapp_quick_replies (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  title text not null,
  body text not null,
  category text not null default 'general',
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_whatsapp_quick_replies_title_length check (char_length(trim(title)) between 2 and 80),
  constraint restaurant_whatsapp_quick_replies_body_length check (char_length(trim(body)) between 2 and 1200),
  constraint restaurant_whatsapp_quick_replies_category_length check (char_length(trim(category)) between 2 and 40)
);

create index if not exists restaurant_whatsapp_quick_replies_restaurant_active_idx
  on restaurant_whatsapp_quick_replies (restaurant_id, is_active, updated_at desc);

drop trigger if exists restaurant_whatsapp_quick_replies_updated_at on restaurant_whatsapp_quick_replies;
create trigger restaurant_whatsapp_quick_replies_updated_at
  before update on restaurant_whatsapp_quick_replies
  for each row execute function set_updated_at();

alter table restaurant_whatsapp_quick_replies enable row level security;

drop policy if exists "members manage restaurant whatsapp quick replies" on restaurant_whatsapp_quick_replies;
create policy "members manage restaurant whatsapp quick replies"
  on restaurant_whatsapp_quick_replies
  for all
  using (
    is_superadmin()
    or has_restaurant_role(restaurant_id, array['restaurant_admin', 'cashier']::app_role[])
  )
  with check (
    is_superadmin()
    or has_restaurant_role(restaurant_id, array['restaurant_admin', 'cashier']::app_role[])
  );
