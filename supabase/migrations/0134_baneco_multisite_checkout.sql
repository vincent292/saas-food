-- Standalone multi-local checkout: one bank payment per branch, never one
-- shared QR whose recipient or allocation would be ambiguous. Delivery is cash.
alter table public.multisite_orders add column bank_payments boolean not null default false;
alter function public.create_public_multisite_order_transaction(uuid,jsonb,jsonb) rename to create_public_multisite_order_transaction_before_bank;
revoke all on function public.create_public_multisite_order_transaction_before_bank(uuid,jsonb,jsonb) from public,anon,authenticated,service_role;
create function public.create_public_multisite_order_transaction(p_request_id uuid,p_order jsonb,p_children jsonb)
returns table(id uuid,tracking_token text) language plpgsql security definer set search_path=public as $$
declare result record; child jsonb; existing multisite_orders%rowtype;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service-role-required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('bank-multi:'||p_request_id::text,0));
  select * into existing from multisite_orders where public_request_id=p_request_id;
  if found then return query select existing.id,existing.tracking_token;return;end if;
  if p_order->>'payment_method'='qr' then
    for child in select * from jsonb_array_elements(p_children) loop
      if resolve_baneco_collection((child->>'restaurant_id')::uuid) is null
        or (child->>'subtotal')::numeric not between .01 and 50000 then raise exception 'bank-connection-unavailable'; end if;
    end loop;
    for result in select * from create_public_multisite_order_transaction_before_bank(p_request_id,jsonb_set(p_order,'{payment_method}','"cash"'),p_children) loop
      update multisite_orders set bank_payments=true,payment_method='qr' where multisite_orders.id=result.id;
      update orders set payment_method='qr',bank_payment_required=true,bank_auto_accept=true,requires_prepayment=true
        where orders.id in(select order_id from multisite_order_children where multisite_order_id=result.id);
      return query select result.id,result.tracking_token;
    end loop;
  else return query select * from create_public_multisite_order_transaction_before_bank(p_request_id,p_order,p_children);
  end if;
end $$;
revoke all on function public.create_public_multisite_order_transaction(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.create_public_multisite_order_transaction(uuid,jsonb,jsonb) to service_role;

do $migration$
declare definition text; patched text; fragment text;
begin
  fragment:='exists(select 1 from multisite_order_children child where child.order_id=o.id)';
  definition:=pg_get_functiondef('public.reserve_baneco_order_qr(uuid,text)'::regprocedure);
  patched:=replace(definition,fragment,'exists(select 1 from multisite_order_children child join multisite_orders master on master.id=child.multisite_order_id where child.order_id=o.id and not master.bank_payments)');
  if patched=definition then raise exception 'bank-multi-reservation-definition-changed';end if;execute patched;
  definition:=pg_get_functiondef('public.apply_baneco_order_payment(uuid)'::regprocedure);
  patched:=replace(definition,fragment,'exists(select 1 from multisite_order_children child join multisite_orders master on master.id=child.multisite_order_id where child.order_id=o.id and not master.bank_payments)');
  if patched=definition then raise exception 'bank-multi-application-definition-changed';end if;execute patched;
  -- Cashier conversion must not change a legacy multi-local cash contract.
  definition:=pg_get_functiondef('public.prepare_baneco_staff_order(uuid,uuid,uuid)'::regprocedure);
  patched:=replace(definition,'exists(select 1 from multisite_order_children where order_id=o.id)',
    'exists(select 1 from multisite_order_children child join multisite_orders master on master.id=child.multisite_order_id where child.order_id=o.id and not master.bank_payments)');
  if patched=definition then raise exception 'bank-multi-staff-definition-changed';end if;execute patched;
end $migration$;
create function public.update_baneco_multisite_prepaid() returns trigger
language plpgsql security definer set search_path=public as $$
declare master_id uuid;
begin
  select c.multisite_order_id into master_id from multisite_order_children c join multisite_orders m on m.id=c.multisite_order_id
    where c.order_id=new.id and m.bank_payments;
  if master_id is not null then
    perform 1 from multisite_orders where id=master_id for update;
    update multisite_orders set products_prepaid_amount=(select coalesce(sum(o.total),0) from orders o
      join multisite_order_children c on c.order_id=o.id where c.multisite_order_id=master_id and o.payment_status='paid') where id=master_id;
  end if;return null;
end $$;
create trigger update_baneco_multisite_prepaid after update of payment_status on public.orders for each row
  when(old.payment_status is distinct from new.payment_status) execute function public.update_baneco_multisite_prepaid();
revoke all on function public.update_baneco_multisite_prepaid() from public,anon,authenticated,service_role;
