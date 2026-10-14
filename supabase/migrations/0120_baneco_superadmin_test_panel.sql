-- Isolated certification tools: never update orders, cash, billing or inventory.
create table public.bank_qr_connections (
  id uuid primary key,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  environment text not null check(environment in ('certification','production')),
  label text not null check(length(label) between 1 and 100),
  credentials_ciphertext text not null,
  encryption_mode text not null check(encryption_mode in ('bank_api','pre_encrypted')),
  branch_code text not null default '' check(length(branch_code)<=5),
  active boolean not null default true,
  checked_at timestamptz,
  check_result text check(check_result in ('ok','error')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create unique index bank_qr_connections_active_idx on public.bank_qr_connections(restaurant_id,environment) where active;

create table public.bank_qr_test_requests (
  id uuid primary key,
  connection_id uuid not null references public.bank_qr_connections(id) on delete restrict,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  transaction_id text not null unique,
  amount numeric(12,2) not null check(amount>=0.01 and amount<=100),
  currency text not null check(currency in ('BOB','USD')),
  due_date date not null,
  description text not null check(length(description)<=150),
  status text not null default 'generating' check(status in ('generating','unknown','pending','paid','cancelled','expired','review')),
  qr_id text,
  qr_image text,
  verified_at timestamptz,
  bank_transaction_id text,
  last_error_code text,
  operation_token uuid,
  operation_until timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index bank_qr_test_requests_qr_idx on public.bank_qr_test_requests(connection_id,qr_id) where qr_id is not null;
create index bank_qr_test_requests_recent_idx on public.bank_qr_test_requests(created_at desc);

alter table public.bank_qr_connections enable row level security;
alter table public.bank_qr_test_requests enable row level security;
-- No authenticated/anon policies, including superadmins: only server service role.
revoke all on public.bank_qr_connections,public.bank_qr_test_requests from public,anon,authenticated;
grant select,insert,update on public.bank_qr_connections,public.bank_qr_test_requests to service_role;

create function public.reserve_baneco_test_qr(
  p_id uuid,p_connection_id uuid,p_actor_id uuid,p_amount numeric,p_currency text,p_due_date date,p_description text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_connection bank_qr_connections%rowtype;
  v_request bank_qr_test_requests%rowtype;
  v_today date := (now() at time zone 'America/La_Paz')::date;
begin
  if not exists(select 1 from profiles where id=p_actor_id and global_role='superadmin') then
    raise exception 'bank-forbidden' using errcode='42501';
  end if;
  select * into v_connection from bank_qr_connections where id=p_connection_id for update;
  if not found or not v_connection.active or v_connection.environment<>'certification' then
    raise exception 'bank-connection-unavailable';
  end if;
  if p_id is null or p_amount is null or p_amount<0.01 or p_amount>100 or p_amount<>round(p_amount,2)
    or p_currency not in ('BOB','USD') or p_currency is null or p_due_date is null
    or p_due_date<v_today or p_due_date>v_today+30 or p_description is null or length(p_description)>150 then
    raise exception 'bank-invalid-input';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  select * into v_request from bank_qr_test_requests where id=p_id;
  if found then
    if v_request.connection_id<>p_connection_id or v_request.amount<>p_amount or v_request.currency<>p_currency
      or v_request.due_date<>p_due_date or v_request.description<>p_description or v_request.created_by<>p_actor_id then
      raise exception 'bank-request-conflict';
    end if;
    return jsonb_build_object('claimed',false,'request',to_jsonb(v_request));
  end if;
  insert into bank_qr_test_requests(id,connection_id,restaurant_id,transaction_id,amount,currency,due_date,description,created_by)
  values(p_id,p_connection_id,v_connection.restaurant_id,'YQ-'||replace(p_id::text,'-',''),p_amount,p_currency,p_due_date,p_description,p_actor_id)
  returning * into v_request;
  return jsonb_build_object('claimed',true,'request',to_jsonb(v_request));
end $$;
revoke all on function public.reserve_baneco_test_qr(uuid,uuid,uuid,numeric,text,date,text) from public,anon,authenticated;
grant execute on function public.reserve_baneco_test_qr(uuid,uuid,uuid,numeric,text,date,text) to service_role;
