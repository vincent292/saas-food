create table if not exists owner_platform_billing_settings (
  owner_user_id uuid primary key references profiles(id) on delete cascade,
  billing_anchor_day integer not null default 15 check (billing_anchor_day >= 1 and billing_anchor_day <= 28),
  next_due_date date not null,
  reminder_days integer not null default 4 check (reminder_days >= 0 and reminder_days <= 15),
  currency text not null default 'BOB',
  platform_qr_url text,
  platform_qr_note text,
  created_by uuid references profiles(id) on delete set null,
  updated_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists owner_platform_payment_cycles (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references profiles(id) on delete cascade,
  due_date date not null,
  period_key text not null,
  branch_count integer not null default 0 check (branch_count >= 0),
  primary_price_monthly numeric(12,2) not null default 450,
  additional_price_monthly numeric(12,2) not null default 199,
  amount_due numeric(12,2) not null default 0 check (amount_due >= 0),
  currency text not null default 'BOB',
  status text not null default 'pending' check (status in ('pending', 'proof_uploaded', 'verified', 'paid', 'overdue', 'cancelled')),
  proof_url text,
  proof_uploaded_at timestamptz,
  proof_verified_at timestamptz,
  proof_verified_by uuid references profiles(id) on delete set null,
  paid_at timestamptz,
  paid_by uuid references profiles(id) on delete set null,
  notes text,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, due_date)
);

create index if not exists idx_owner_platform_payment_cycles_owner_due
  on owner_platform_payment_cycles(owner_user_id, due_date desc);

create index if not exists idx_owner_platform_payment_cycles_status
  on owner_platform_payment_cycles(status, due_date);

drop trigger if exists owner_platform_billing_settings_updated_at on owner_platform_billing_settings;
create trigger owner_platform_billing_settings_updated_at
  before update on owner_platform_billing_settings
  for each row execute function set_updated_at();

drop trigger if exists owner_platform_payment_cycles_updated_at on owner_platform_payment_cycles;
create trigger owner_platform_payment_cycles_updated_at
  before update on owner_platform_payment_cycles
  for each row execute function set_updated_at();

alter table owner_platform_billing_settings enable row level security;
alter table owner_platform_payment_cycles enable row level security;

drop policy if exists "owners read account billing settings" on owner_platform_billing_settings;
create policy "owners read account billing settings" on owner_platform_billing_settings
for select using (owner_user_id = auth.uid() or is_superadmin());

drop policy if exists "superadmin manages account billing settings" on owner_platform_billing_settings;
create policy "superadmin manages account billing settings" on owner_platform_billing_settings
for all using (is_superadmin())
with check (is_superadmin());

drop policy if exists "owners read account payment cycles" on owner_platform_payment_cycles;
create policy "owners read account payment cycles" on owner_platform_payment_cycles
for select using (owner_user_id = auth.uid() or is_superadmin());

drop policy if exists "superadmin manages account payment cycles" on owner_platform_payment_cycles;
create policy "superadmin manages account payment cycles" on owner_platform_payment_cycles
for all using (is_superadmin())
with check (is_superadmin());

grant select on owner_platform_billing_settings to authenticated;
grant select on owner_platform_payment_cycles to authenticated;
grant insert, update on owner_platform_billing_settings to authenticated;
grant insert, update on owner_platform_payment_cycles to authenticated;
