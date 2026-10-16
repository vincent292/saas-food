-- No account is selected or enabled by this migration. Only superadmin may
-- explicitly designate an authorized platform collection account.
create table public.bank_collection_settings (
  singleton boolean primary key default true check(singleton),
  connection_id uuid references public.bank_qr_connections(id) on delete restrict,
  enabled boolean not null default false,
  authorized_at timestamptz,
  authorized_by uuid references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now(),
  check(not enabled or (connection_id is not null and authorized_at is not null and authorized_by is not null))
);
insert into public.bank_collection_settings(singleton) values(true);
alter table public.bank_collection_settings enable row level security;
revoke all on public.bank_collection_settings from public,anon,authenticated;
grant select,update on public.bank_collection_settings to service_role;

create function public.resolve_baneco_collection(p_restaurant uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare c bank_qr_connections%rowtype; candidate uuid;
begin
  if not exists(select 1 from restaurants r join restaurant_settings s on s.restaurant_id=r.id
    where r.id=p_restaurant and r.status='active' and r.deleted_at is null and s.currency='BOB') then return null; end if;
  select * into c from bank_qr_connections where restaurant_id=p_restaurant and environment='production' and active;
  if found then
    -- Never silently redirect an existing but disabled/unverified local account.
    if c.orders_enabled and c.check_result='ok' then return c.id; end if;
    return null;
  end if;
  select connection_id into candidate from bank_collection_settings where singleton and enabled;
  select * into c from bank_qr_connections where id=candidate and environment='production' and active and orders_enabled and check_result='ok';
  if found then return c.id; end if; return null;
end $$;
revoke all on function public.resolve_baneco_collection(uuid) from public,anon,authenticated;
grant execute on function public.resolve_baneco_collection(uuid) to service_role;

alter table public.bank_qr_test_requests add column receiver_restaurant_id uuid references public.restaurants(id) on delete restrict,
  add column collection_route text check(collection_route in ('merchant','platform'));
update public.bank_qr_test_requests r set receiver_restaurant_id=c.restaurant_id,
  collection_route=case when c.restaurant_id=r.restaurant_id then 'merchant' else 'platform' end
  from public.bank_qr_connections c where c.id=r.connection_id;
alter table public.bank_qr_test_requests alter column receiver_restaurant_id set not null,alter column collection_route set not null;
create function public.bind_baneco_receiver() returns trigger
language plpgsql security definer set search_path=public as $$
declare receiver uuid;
begin
  if tg_op='UPDATE' then
    if new.connection_id is distinct from old.connection_id or new.restaurant_id is distinct from old.restaurant_id
      or new.receiver_restaurant_id is distinct from old.receiver_restaurant_id or new.collection_route is distinct from old.collection_route then
      raise exception 'bank-recipient-immutable'; end if;
    return new;
  end if;
  select restaurant_id into receiver from bank_qr_connections where id=new.connection_id;
  if receiver is distinct from new.restaurant_id and (new.environment<>'production' or
    new.connection_id is distinct from resolve_baneco_collection(new.restaurant_id)) then raise exception 'bank-connection-unavailable'; end if;
  new.receiver_restaurant_id:=receiver;
  new.collection_route:=case when receiver=new.restaurant_id then 'merchant' else 'platform' end;
  return new;
end $$;
create trigger bind_baneco_receiver before insert or update on public.bank_qr_test_requests for each row execute function public.bind_baneco_receiver();

-- This is an obligation ledger, NOT a bank transfer or a claim of settlement.
create table public.bank_collection_receivables (
  request_id uuid primary key references public.bank_qr_test_requests(id) on delete restrict,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  receiver_restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  amount numeric(12,2) not null check(amount>0),currency text not null check(currency='BOB'),
  created_at timestamptz not null default now()
);
alter table public.bank_collection_receivables enable row level security;
revoke all on public.bank_collection_receivables from public,anon,authenticated;
grant select on public.bank_collection_receivables to service_role;
create function public.record_baneco_collection_receivable() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.status='paid' and new.collection_route='platform' and (new.order_id is not null or new.group_bill_id is not null) then
    insert into bank_collection_receivables(request_id,restaurant_id,receiver_restaurant_id,amount,currency)
      values(new.id,new.restaurant_id,new.receiver_restaurant_id,new.amount,new.currency) on conflict do nothing;
  end if;return null;
end $$;
create trigger record_baneco_collection_receivable after update of status on public.bank_qr_test_requests for each row execute function public.record_baneco_collection_receivable();

-- Preserve existing guards, pricing, locking, retry semantics and grants. Fail
-- migration if an expected definition changed instead of patching blindly.
do $migration$
declare definition text; fragment text; patched text;
begin
  definition:=pg_get_functiondef('public.reserve_baneco_order_qr(uuid,text)'::regprocedure);
  fragment:='select connection.* into c from bank_qr_connections connection join orders ord on ord.restaurant_id=connection.restaurant_id';
  patched:=replace(definition,fragment,'select connection.* into c from bank_qr_connections connection join orders ord on connection.id=resolve_baneco_collection(ord.restaurant_id)');
  if patched=definition then raise exception 'bank-routing-order-definition-changed'; end if;execute patched;
  definition:=pg_get_functiondef('public.reserve_baneco_group_bill(uuid,text,boolean,uuid,uuid,text,boolean)'::regprocedure);
  patched:=replace(definition,'where restaurant_id=b.restaurant_id and environment=''production'' and active and orders_enabled and check_result=''ok'' for update',
    'where id=resolve_baneco_collection(b.restaurant_id) and environment=''production'' and active and orders_enabled and check_result=''ok'' for update');
  if patched=definition then raise exception 'bank-routing-group-definition-changed'; end if;execute patched;
  definition:=pg_get_functiondef('public.create_public_order_transaction(uuid,jsonb,jsonb)'::regprocedure);
  fragment:='and exists(select 1 from bank_qr_connections c join restaurant_settings s on s.restaurant_id=c.restaurant_id
        where c.restaurant_id=(p_order->>''restaurant_id'')::uuid and c.environment=''production''
          and c.active and c.orders_enabled and c.check_result=''ok'' and s.currency=''BOB'')';
  patched:=replace(definition,fragment,'and resolve_baneco_collection((p_order->>''restaurant_id'')::uuid) is not null');
  if patched=definition then raise exception 'bank-routing-checkout-definition-changed'; end if;execute patched;
  definition:=patched;
  patched:=replace(definition,'if not dynamic_qr and coalesce((p_order->>''bank_checkout'')::boolean,false) then raise exception ''bank-qr-required''; end if;',
    'if not dynamic_qr then raise exception ''bank-qr-required''; end if;');
  if patched=definition then raise exception 'bank-routing-checkout-guard-changed'; end if;execute patched;
end $migration$;
revoke all on function public.bind_baneco_receiver(),public.record_baneco_collection_receivable() from public,anon,authenticated,service_role;
