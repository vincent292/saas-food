-- Retain all pricing, stock, restaurant, schedule and idempotency checks in 0063.
-- A verified merchant can defer receipt submission until its order-specific QR
-- is generated and paid on tracking. The resulting order remains unpaid.
alter function public.create_public_order_transaction(uuid,jsonb,jsonb) rename to create_public_order_transaction_before_baneco;
revoke all on function public.create_public_order_transaction_before_baneco(uuid,jsonb,jsonb) from public,anon,authenticated,service_role;
create function public.create_public_order_transaction(p_request_id uuid,p_order jsonb,p_items jsonb)
returns table(id uuid,tracking_token text) language plpgsql security definer set search_path=public as $$
declare dynamic_qr boolean:=false; payload jsonb:=p_order; created record;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service-role-required' using errcode='42501'; end if;
  dynamic_qr:=p_order->>'payment_method'='qr' and coalesce(p_order->>'payment_receipt_url','')=''
    and (p_order->>'total')::numeric between 0.01 and 50000
    and exists(select 1 from bank_qr_connections c join restaurant_settings s on s.restaurant_id=c.restaurant_id
      where c.restaurant_id=(p_order->>'restaurant_id')::uuid and c.environment='production'
        and c.active and c.orders_enabled and c.check_result='ok' and s.currency='BOB');
  if dynamic_qr then payload:=jsonb_set(payload,'{requires_prepayment}','false'::jsonb); end if;
  for created in select legacy.* from create_public_order_transaction_before_baneco(p_request_id,payload,p_items) legacy
  loop
    if dynamic_qr and coalesce((p_order->>'requires_prepayment')::boolean,false) then
      update orders set requires_prepayment=true where orders.id=created.id and payment_method='qr' and payment_status='pending';
    end if;
    return query select created.id,created.tracking_token;
  end loop;
end $$;
revoke all on function public.create_public_order_transaction(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.create_public_order_transaction(uuid,jsonb,jsonb) to service_role;
