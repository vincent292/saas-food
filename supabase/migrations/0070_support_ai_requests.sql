create table if not exists support_ai_requests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null default 'other' check (category in ('access', 'billing', 'orders', 'cash', 'inventory', 'incident', 'other')),
  question text not null,
  answer text,
  resolved_by_ai boolean not null default false,
  ticket_id uuid references support_tickets(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_support_ai_requests_restaurant_created on support_ai_requests(restaurant_id, created_at desc);
create index if not exists idx_support_ai_requests_user_created on support_ai_requests(user_id, created_at desc);

alter table support_ai_requests enable row level security;

drop policy if exists "members read support ai requests" on support_ai_requests;
create policy "members read support ai requests" on support_ai_requests for select using (
  is_superadmin()
  or user_id = auth.uid()
  or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier','kitchen','waiter']::app_role[])
);

drop policy if exists "members create support ai requests" on support_ai_requests;
create policy "members create support ai requests" on support_ai_requests for insert to authenticated with check (
  user_id = auth.uid()
  and (
    is_superadmin()
    or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier','kitchen','waiter']::app_role[])
  )
);

grant select, insert on support_ai_requests to authenticated;
