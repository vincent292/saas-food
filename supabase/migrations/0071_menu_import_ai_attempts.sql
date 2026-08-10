create table if not exists menu_import_ai_attempts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text,
  file_type text,
  file_size bigint not null default 0,
  status text not null check (status in ('success', 'failed')),
  error_code text,
  created_at timestamptz not null default now()
);

create index if not exists idx_menu_import_ai_attempts_restaurant_created on menu_import_ai_attempts(restaurant_id, created_at desc);
create index if not exists idx_menu_import_ai_attempts_user_created on menu_import_ai_attempts(user_id, created_at desc);

alter table menu_import_ai_attempts enable row level security;

drop policy if exists "members read menu import ai attempts" on menu_import_ai_attempts;
create policy "members read menu import ai attempts" on menu_import_ai_attempts for select using (
  is_superadmin()
  or user_id = auth.uid()
  or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[])
);

drop policy if exists "members create menu import ai attempts" on menu_import_ai_attempts;
create policy "members create menu import ai attempts" on menu_import_ai_attempts for insert to authenticated with check (
  user_id = auth.uid()
  and (
    is_superadmin()
    or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[])
  )
);

grant select, insert on menu_import_ai_attempts to authenticated;
