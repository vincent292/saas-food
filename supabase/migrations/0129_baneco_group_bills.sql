-- Existing sessions retain their legacy collection contract. New sessions use
-- branch-scoped, bank-verified bills; nobody can self-declare a bank payment.
alter table public.group_order_sessions add column bank_payments boolean not null default false,
  add column bank_funding_confirmed boolean not null default false,
  add column bank_submission_token uuid,add column bank_submission_until timestamptz;
alter table public.group_order_sessions alter column bank_payments set default true;
create table public.bank_group_bills(
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.group_order_sessions(id) on delete restrict,
  participant_id uuid not null references public.group_order_participants(id) on delete restrict,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  amount numeric(12,2) not null check(amount between 0.01 and 50000),
  items jsonb not null check(jsonb_typeof(items)='array' and jsonb_array_length(items)>0),
  mode text not null default 'qr' check(mode in ('qr','cash')),
  paid_request_id uuid unique references public.bank_qr_test_requests(id) on delete restrict,
  requested_by uuid references public.group_order_participants(id) on delete restrict,
  cash_assumed_by uuid references public.group_order_participants(id) on delete restrict,
  order_id uuid references public.orders(id) on delete restrict,
  voided_at timestamptz,created_at timestamptz not null default now()
);
create unique index bank_group_bill_active_pair on public.bank_group_bills(session_id,participant_id,restaurant_id) where voided_at is null;
alter table public.bank_group_bills enable row level security;
revoke all on public.bank_group_bills from public,anon,authenticated;
grant select,insert,update on public.bank_group_bills to service_role;
alter table public.bank_qr_test_requests add column group_bill_id uuid references public.bank_group_bills(id) on delete restrict;
alter table public.bank_qr_test_requests add constraint bank_request_one_purpose check(order_id is null or group_bill_id is null);
create unique index bank_group_bill_live_qr on public.bank_qr_test_requests(group_bill_id) where group_bill_id is not null and status not in ('failed','cancelled');
alter table public.orders add column bank_group_session_id uuid references public.group_order_sessions(id) on delete restrict,
  add column group_prepaid_amount numeric(12,2) not null default 0 check(group_prepaid_amount>=0),
  add column group_cash_due numeric(12,2) not null default 0 check(group_cash_due>=0);
alter table public.cash_movements add column bank_group_bill_id uuid unique references public.bank_group_bills(id) on delete restrict,
  add column group_balance_order_id uuid unique references public.orders(id) on delete restrict;
drop index public.cash_movement_bank_order_once_idx;
create unique index cash_movement_bank_order_once_idx on public.cash_movements(order_id)
  where bank_qr_request_id is not null and bank_group_bill_id is null and type='sale';

create function public.bank_group_actor(p_session uuid,p_secret text,p_host boolean default false) returns uuid
language plpgsql security definer set search_path=public as $$
declare s group_order_sessions%rowtype; actor uuid;
begin
  select * into s from group_order_sessions where id=p_session;
  if not found or not s.bank_payments then raise exception 'group-bank-unavailable'; end if;
  if p_host then
    if s.host_access_token is distinct from p_secret then raise exception 'group-bank-forbidden' using errcode='42501'; end if;
    actor:=s.host_participant_id;
  else select id into actor from group_order_participants where session_id=s.id and participant_token=p_secret;
  end if;
  if actor is null or not exists(select 1 from group_order_participants where id=actor and session_id=s.id) then raise exception 'group-bank-forbidden' using errcode='42501'; end if;
  return actor;
end $$;

-- Mutations serialize on the same parent row as reserve/finalize. A paid or
-- in-flight basket cannot be edited, removed, excluded or cancelled by UI/API.
create function public.guard_bank_group_items() returns trigger
language plpgsql security definer set search_path=public as $$
declare sid uuid; pid uuid; rid uuid; s group_order_sessions%rowtype;
begin
  sid:=case when tg_op='DELETE' then old.session_id else new.session_id end;
  pid:=case when tg_op='DELETE' then old.participant_id else new.participant_id end;
  rid:=case when tg_op='DELETE' then old.restaurant_id else new.restaurant_id end;
  select * into s from group_order_sessions where id=sid for update;
  if s.bank_payments then
    if s.status<>'open' or s.expires_at<=now() then raise exception 'group-closed'; end if;
    if exists(select 1 from bank_group_bills where session_id=sid and participant_id=pid and restaurant_id=rid and voided_at is null)
      or (tg_op='UPDATE' and exists(select 1 from bank_group_bills where session_id=old.session_id and participant_id=old.participant_id and restaurant_id=old.restaurant_id and voided_at is null)) then
      raise exception 'group-basket-frozen';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;return new;
end $$;
create trigger guard_bank_group_items before insert or update or delete on public.group_order_items for each row execute function public.guard_bank_group_items();

create function public.guard_bank_group_session() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if old.bank_payments and not new.bank_payments then raise exception 'group-bank-policy-immutable'; end if;
  if old.bank_payments and new.status in ('cancelled','expired') and exists(
    select 1 from bank_group_bills b join bank_qr_test_requests r on r.group_bill_id=b.id
    where b.session_id=old.id and r.status not in ('failed','cancelled')) then raise exception 'group-payment-review-required'; end if;
  return new;
end $$;
create trigger guard_bank_group_session before update on public.group_order_sessions for each row execute function public.guard_bank_group_session();

create function public.reserve_baneco_group_bill(p_session uuid,p_secret text,p_host boolean,p_participant uuid,p_restaurant uuid,p_mode text,p_paying_other boolean default false) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s group_order_sessions%rowtype; b bank_group_bills%rowtype; c bank_qr_connections%rowtype; r bank_qr_test_requests%rowtype;
  actor uuid; snapshot jsonb; amount_due numeric; new_id uuid:=gen_random_uuid();
begin
  select * into s from group_order_sessions where id=p_session for update;
  actor:=bank_group_actor(s.id,p_secret,p_host);
  if s.status not in ('open','locked') or s.expires_at<=now() then raise exception 'group-closed'; end if;
  if p_mode not in ('qr','cash','reset') or p_mode is null then raise exception 'group-bank-invalid'; end if;
  if not exists(select 1 from group_order_participants where id=p_participant and session_id=s.id) then raise exception 'group-bank-forbidden'; end if;
  if actor<>p_participant and not p_paying_other then raise exception 'group-cover-confirmation-required'; end if;
  -- A member can pay another member, but cannot declare THEIR cash promise.
  -- Another person's cash is explicitly assumed by the actor, retained in audit.
  select * into b from bank_group_bills where session_id=s.id and participant_id=p_participant and restaurant_id=p_restaurant and voided_at is null for update;
  if found then
    if p_mode='reset' and actor<>p_participant and not p_host and b.cash_assumed_by is distinct from actor then raise exception 'group-bank-forbidden'; end if;
    if b.order_id is not null then raise exception 'group-closed'; end if;
    if b.paid_request_id is not null then return jsonb_build_object('claimed',false,'billId',b.id,'paid',true); end if;
    select * into r from bank_qr_test_requests where group_bill_id=b.id and status not in ('failed','cancelled');
    if found then
      if p_mode='qr' then return jsonb_build_object('claimed',false,'billId',b.id,'request',to_jsonb(r)-'qr_image'); end if;
      raise exception 'group-cancel-qr-first';
    end if;
    if p_mode='reset' then update bank_group_bills set voided_at=now() where id=b.id;return jsonb_build_object('billId',b.id,'reset',true); end if;
  elsif p_mode='reset' then return '{}'::jsonb;
  else
    select jsonb_agg(to_jsonb(i) order by i.id),sum(i.subtotal) into snapshot,amount_due from group_order_items i
      where i.session_id=s.id and i.participant_id=p_participant and i.restaurant_id=p_restaurant;
    if snapshot is null or amount_due not between 0.01 and 50000 then raise exception 'group-bank-empty'; end if;
    if not exists(select 1 from restaurants where id=p_restaurant and status='active' and deleted_at is null) then raise exception 'group-bank-unavailable'; end if;
    insert into bank_group_bills(session_id,participant_id,restaurant_id,amount,items,mode,requested_by)
      values(s.id,p_participant,p_restaurant,amount_due,snapshot,case when p_mode='cash' then 'cash' else 'qr' end,actor) returning * into b;
  end if;
  if p_mode='cash' then
    update bank_group_bills set mode='cash',cash_assumed_by=actor where id=b.id;
    return jsonb_build_object('claimed',false,'billId',b.id,'cash',true);
  end if;
  select * into c from bank_qr_connections where restaurant_id=b.restaurant_id and environment='production' and active and orders_enabled and check_result='ok' for update;
  if not found or not exists(select 1 from restaurant_settings where restaurant_id=b.restaurant_id and currency='BOB') then raise exception 'bank-connection-unavailable'; end if;
  update bank_group_bills set mode='qr',requested_by=actor,cash_assumed_by=null where id=b.id;
  insert into bank_qr_test_requests(id,connection_id,restaurant_id,environment,transaction_id,amount,currency,due_date,description,group_bill_id)
    values(new_id,c.id,b.restaurant_id,'production','YQ-'||replace(new_id::text,'-',''),b.amount,'BOB',
      (now() at time zone 'America/La_Paz')::date,'Yopido Grupal · productos',b.id) returning * into r;
  return jsonb_build_object('claimed',true,'billId',b.id,'request',to_jsonb(r)-'qr_image');
end $$;

create function public.guard_bank_group_participant() returns trigger
language plpgsql security definer set search_path=public as $$
declare s group_order_sessions%rowtype;
begin
  select * into s from group_order_sessions where id=new.session_id for update;
  if s.bank_payments and new.payment_status is distinct from old.payment_status then
    if new.payment_status in ('paid_qr','qr_uploaded','covered_by_host') then raise exception 'group-use-bank-bills'; end if;
    if exists(select 1 from bank_group_bills where session_id=s.id and participant_id=new.id and voided_at is null) then raise exception 'group-use-bank-bills'; end if;
  end if;
  return new;
end $$;
create trigger guard_bank_group_participant before update on public.group_order_participants for each row execute function public.guard_bank_group_participant();

create function public.confirm_baneco_group_bill() returns trigger
language plpgsql security definer set search_path=public as $$
declare b bank_group_bills%rowtype;
begin
  if new.group_bill_id is not null and new.status='paid' and old.status is distinct from 'paid' then
    select * into b from bank_group_bills where id=new.group_bill_id;
    -- Freeze/reserve/finalize share parent-first ordering. Bank confirmation is
    -- already durable; this only links the authenticated, matching payment.
    perform 1 from group_order_sessions where id=b.session_id for update;
    update bank_group_bills set paid_request_id=new.id where id=b.id and paid_request_id is null
      and restaurant_id=new.restaurant_id and amount=new.amount and new.currency='BOB' and new.environment='production';
    if found then update group_order_sessions set bank_funding_confirmed=true where id=b.session_id; end if;
  end if;
  return null;
end $$;
create trigger confirm_baneco_group_bill after update of status on public.bank_qr_test_requests for each row execute function public.confirm_baneco_group_bill();
create function public.broadcast_bank_group_bill() returns trigger
language plpgsql security definer set search_path=public as $$
declare token text;
begin
  select public_token into token from group_order_sessions where id=new.session_id;
  perform realtime.send(jsonb_build_object('changed',true),'changed','bank-group:'||token,false);
  return null;
exception when others then return null;
end $$;
create trigger broadcast_bank_group_bill after insert or update on public.bank_group_bills for each row execute function public.broadcast_bank_group_bill();

create function public.begin_bank_group_submission(p_session uuid,p_secret text,p_token uuid) returns void
language plpgsql security definer set search_path=public as $$
declare s group_order_sessions%rowtype;
begin
  select * into s from group_order_sessions where id=p_session for update;
  perform bank_group_actor(s.id,p_secret,true);
  if s.status='submitted' then return; end if;
  if (s.status not in ('locked','submitting') and not(s.status='open' and s.expires_at<=now() and s.bank_funding_confirmed))
    or (s.expires_at<=now() and not s.bank_funding_confirmed) then raise exception 'lock-required'; end if;
  if s.status='submitting' and s.bank_submission_until>now() then raise exception 'already-submitting'; end if;
  update group_order_sessions set status='submitting',bank_submission_token=p_token,bank_submission_until=now()+interval '3 minutes' where id=s.id;
end $$;

-- Cashier's established charge RPC inserts total. For a bank-funded group the
-- remaining cash sale is reduced IN THAT SAME transaction, not after the fact.
create function public.guard_group_cash_movement() returns trigger
language plpgsql security definer set search_path=public as $$
declare o orders%rowtype; b bank_group_bills%rowtype;
begin
  if new.type<>'sale' or new.order_id is null then return new; end if;
  select * into o from orders where id=new.order_id;
  if o.bank_group_session_id is null then return new; end if;
  if new.bank_group_bill_id is not null then
    select * into b from bank_group_bills where id=new.bank_group_bill_id;
    if b.order_id is distinct from o.id or b.paid_request_id is null or new.bank_qr_request_id is distinct from b.paid_request_id or new.amount<>b.amount or new.payment_method<>'qr' then raise exception 'group-bank-sale-mismatch'; end if;
  else
    if o.group_cash_due<=0 or new.payment_method<>'cash' or new.amount not in (o.total,o.group_cash_due) then raise exception 'group-cash-balance-invalid'; end if;
    new.amount:=o.group_cash_due;new.group_balance_order_id:=o.id;
  end if;
  return new;
end $$;
create trigger guard_group_cash_movement before insert on public.cash_movements for each row execute function public.guard_group_cash_movement();
create function public.guard_group_bank_order() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if old.bank_group_session_id is not null then
    if new.total<>old.total or new.group_prepaid_amount<>old.group_prepaid_amount or new.group_cash_due<>old.group_cash_due
      or new.bank_group_session_id is distinct from old.bank_group_session_id then raise exception 'group-bill-total-locked'; end if;
    if new.payment_status='refunded' and old.group_prepaid_amount>0 then raise exception 'group-bank-refund-review-required'; end if;
    if old.payment_status<>'paid' and new.payment_status='paid' and old.group_cash_due>0 and new.payment_method<>'cash' then raise exception 'group-cash-balance-required'; end if;
    if old.group_cash_due>0 and new.payment_status<>'paid' and new.status not in ('pending','cancelled') then raise exception 'group-cash-balance-required'; end if;
  end if;
  return new;
end $$;
create trigger guard_group_bank_order before update on public.orders for each row execute function public.guard_group_bank_order();
revoke all on function public.bank_group_actor(uuid,text,boolean),public.guard_bank_group_items(),public.guard_bank_group_session(),
 public.reserve_baneco_group_bill(uuid,text,boolean,uuid,uuid,text,boolean),public.confirm_baneco_group_bill(),public.broadcast_bank_group_bill(),
 public.begin_bank_group_submission(uuid,text,uuid),public.guard_group_cash_movement(),public.guard_group_bank_order() from public,anon,authenticated;
revoke all on function public.guard_bank_group_participant() from public,anon,authenticated;
grant execute on function public.reserve_baneco_group_bill(uuid,text,boolean,uuid,uuid,text,boolean),public.begin_bank_group_submission(uuid,text,uuid) to service_role;
