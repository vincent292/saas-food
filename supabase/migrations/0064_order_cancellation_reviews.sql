create table if not exists order_cancellation_reviews (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  order_number text not null,
  order_status_at_cancellation order_status not null,
  payment_status_at_cancellation payment_status not null,
  order_type order_type not null,
  total numeric(12, 2) not null default 0,
  payment_method payment_method_type,
  cancellation_kind text not null default 'cancelled' check (cancellation_kind in ('rejected', 'cancelled', 'deleted')),
  reason text not null,
  cancelled_by uuid references auth.users(id) on delete set null,
  cancelled_by_name text,
  cancelled_by_email text,
  cancelled_at timestamptz not null default now(),
  payment_receipt_url text,
  payment_receipt_reference text,
  payment_receipt_uploaded_at timestamptz,
  requested_fulfillment_at timestamptz,
  accepted_at timestamptz,
  ready_at timestamptz,
  dispatched_at timestamptz,
  delivered_at timestamptz,
  cash_session_id uuid references cash_sessions(id) on delete set null,
  cash_movement_id uuid references cash_movements(id) on delete set null,
  owner_review_status text not null default 'pending' check (owner_review_status in ('pending', 'approved', 'observed')),
  owner_review_notes text,
  owner_reviewed_by uuid references auth.users(id) on delete set null,
  owner_reviewed_at timestamptz,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id)
);

create index if not exists order_cancellation_reviews_restaurant_cancelled_at_idx
  on order_cancellation_reviews (restaurant_id, cancelled_at desc);

create index if not exists order_cancellation_reviews_owner_status_idx
  on order_cancellation_reviews (restaurant_id, owner_review_status, cancelled_at desc);

alter table order_cancellation_reviews enable row level security;

drop policy if exists "Restaurant members can create cancellation reviews" on order_cancellation_reviews;
create policy "Restaurant members can create cancellation reviews"
  on order_cancellation_reviews
  for insert
  with check (
    has_restaurant_role(restaurant_id, array['restaurant_admin', 'cashier', 'kitchen', 'waiter']::app_role[])
    or is_superadmin()
  );

drop policy if exists "Restaurant owners can read cancellation reviews" on order_cancellation_reviews;
create policy "Restaurant owners can read cancellation reviews"
  on order_cancellation_reviews
  for select
  using (
    exists (
      select 1
      from restaurants r
      where r.id = order_cancellation_reviews.restaurant_id
        and r.owner_user_id = auth.uid()
        and r.deleted_at is null
    )
    or is_superadmin()
  );

drop policy if exists "Restaurant owners can review cancellations" on order_cancellation_reviews;
create policy "Restaurant owners can review cancellations"
  on order_cancellation_reviews
  for update
  using (
    exists (
      select 1
      from restaurants r
      where r.id = order_cancellation_reviews.restaurant_id
        and r.owner_user_id = auth.uid()
        and r.deleted_at is null
    )
    or is_superadmin()
  )
  with check (
    exists (
      select 1
      from restaurants r
      where r.id = order_cancellation_reviews.restaurant_id
        and r.owner_user_id = auth.uid()
        and r.deleted_at is null
    )
    or is_superadmin()
  );

create or replace function touch_order_cancellation_reviews_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists order_cancellation_reviews_touch_updated_at on order_cancellation_reviews;
create trigger order_cancellation_reviews_touch_updated_at
  before update on order_cancellation_reviews
  for each row
  execute function touch_order_cancellation_reviews_updated_at();
