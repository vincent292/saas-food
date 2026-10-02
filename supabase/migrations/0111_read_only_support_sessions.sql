-- Temporary, auditable support sessions. These never replace the authenticated
-- superadmin identity; the application uses them only to render a read-only
-- support context and rejects mutations while one is active.
create table if not exists support_impersonation_sessions (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  target_user_id uuid not null references auth.users(id) on delete restrict,
  restaurant_id uuid not null references restaurants(id) on delete restrict,
  target_role app_role not null,
  purpose text not null check (char_length(trim(purpose)) between 10 and 500),
  mode text not null default 'read_only' check (mode = 'read_only'),
  token_hash text not null unique,
  status text not null default 'active' check (status in ('active', 'ended', 'expired', 'revoked')),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  ended_reason text
);

create index if not exists idx_support_impersonation_sessions_actor_active
  on support_impersonation_sessions(actor_user_id, status, expires_at desc);

alter table support_impersonation_sessions enable row level security;

drop policy if exists "superadmin manages support impersonation sessions" on support_impersonation_sessions;
create policy "superadmin manages support impersonation sessions"
  on support_impersonation_sessions for all
  using (is_superadmin())
  with check (is_superadmin());
