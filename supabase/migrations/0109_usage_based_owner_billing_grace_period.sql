-- A billing cycle is only collectible when the owner's restaurants received
-- at least one order in its billing window.  The explicit snapshot makes the
-- result auditable and prevents a future price/branch change from rewriting
-- an already closed period.
alter table owner_platform_billing_settings
  add column if not exists grace_days integer not null default 3
    check (grace_days >= 0 and grace_days <= 15);

alter table owner_platform_payment_cycles
  add column if not exists usage_window_starts_on date,
  add column if not exists usage_window_ends_on date,
  add column if not exists usage_order_count integer not null default 0
    check (usage_order_count >= 0),
  add column if not exists is_billable boolean not null default false;

-- Keep historical paid invoices collectible/auditable. Zero-value cycles
-- remain non-billable, which also covers the old automatic no-use payment.
update owner_platform_payment_cycles
set is_billable = amount_due > 0
where is_billable = false
  and amount_due > 0;

create index if not exists idx_orders_restaurant_created_for_billing
  on orders (restaurant_id, created_at);

comment on column owner_platform_billing_settings.grace_days is
  'Full calendar days after the due date before access is suspended.';
comment on column owner_platform_payment_cycles.is_billable is
  'True only when at least one order was created in the billing window.';
