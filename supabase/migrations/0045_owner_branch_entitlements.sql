create table if not exists owner_branch_entitlements (
  owner_user_id uuid primary key references auth.users(id) on delete cascade,
  branch_limit integer not null default 1 check (branch_limit >= 1),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_owner_branch_entitlements_limit on owner_branch_entitlements(branch_limit);

drop trigger if exists owner_branch_entitlements_updated_at on owner_branch_entitlements;
create trigger owner_branch_entitlements_updated_at before update on owner_branch_entitlements for each row execute function set_updated_at();

alter table owner_branch_entitlements enable row level security;

drop policy if exists "owners read branch entitlements" on owner_branch_entitlements;
create policy "owners read branch entitlements" on owner_branch_entitlements
  for select using (auth.uid() = owner_user_id);

drop policy if exists "superadmin manages branch entitlements" on owner_branch_entitlements;
create policy "superadmin manages branch entitlements" on owner_branch_entitlements
  for all using (is_superadmin()) with check (is_superadmin());

grant select, insert, update on owner_branch_entitlements to authenticated;

insert into owner_branch_entitlements (owner_user_id, branch_limit)
select owner_user_id, 1
from restaurants
where owner_user_id is not null
group by owner_user_id
on conflict (owner_user_id) do nothing;
