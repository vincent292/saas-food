create table if not exists support_ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets(id) on delete cascade,
  restaurant_id uuid references restaurants(id) on delete cascade,
  file_url text not null,
  file_name text not null,
  file_size bigint not null default 0,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_support_ticket_attachments_ticket on support_ticket_attachments(ticket_id, created_at desc);
create index if not exists idx_support_ticket_attachments_restaurant on support_ticket_attachments(restaurant_id, created_at desc);

alter table support_ticket_attachments enable row level security;

drop policy if exists "members read support tickets" on support_tickets;
create policy "members read support tickets" on support_tickets for select using (
  is_superadmin()
  or (restaurant_id is not null and has_restaurant_role(restaurant_id, array['restaurant_admin','cashier','kitchen','waiter']::app_role[]))
);

drop policy if exists "members create support tickets" on support_tickets;
create policy "members create support tickets" on support_tickets for insert to authenticated with check (
  is_superadmin()
  or (
    restaurant_id is not null
    and created_by = auth.uid()
    and has_restaurant_role(restaurant_id, array['restaurant_admin','cashier','kitchen','waiter']::app_role[])
  )
);

drop policy if exists "superadmin manages support ticket attachments" on support_ticket_attachments;
create policy "superadmin manages support ticket attachments" on support_ticket_attachments for all using (is_superadmin()) with check (is_superadmin());

drop policy if exists "members read support ticket attachments" on support_ticket_attachments;
create policy "members read support ticket attachments" on support_ticket_attachments for select using (
  is_superadmin()
  or (restaurant_id is not null and has_restaurant_role(restaurant_id, array['restaurant_admin','cashier','kitchen','waiter']::app_role[]))
);

drop policy if exists "members create support ticket attachments" on support_ticket_attachments;
create policy "members create support ticket attachments" on support_ticket_attachments for insert to authenticated with check (
  restaurant_id is not null
  and uploaded_by = auth.uid()
  and has_restaurant_role(restaurant_id, array['restaurant_admin','cashier','kitchen','waiter']::app_role[])
);

grant select, insert on support_tickets to authenticated;
grant select, insert on support_ticket_attachments to authenticated;
