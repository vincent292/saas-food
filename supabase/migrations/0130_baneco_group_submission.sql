alter table public.multisite_orders add column bank_group_session_id uuid references public.group_order_sessions(id) on delete restrict,
  add column products_prepaid_amount numeric(12,2) not null default 0;

create function public.finalize_baneco_group(p_session uuid,p_secret text,p_token uuid,p_order jsonb,p_stops jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s group_order_sessions%rowtype; b bank_group_bills%rowtype; local_id uuid; local_total numeric; prepaid numeric;
  all_total numeric; rider_fee numeric; child_items jsonb; children jsonb:='[]'; child jsonb; dest jsonb; created record;
  result_id uuid; tracking text; child_order_id uuid; cash_id uuid; kitchen boolean; included_count integer:=0; receipt bank_qr_test_requests%rowtype;
begin
  select * into s from group_order_sessions where id=p_session for update;
  perform bank_group_actor(s.id,p_secret,true);
  if s.status='submitted' then
    if s.submitted_multisite_order_id is not null then
      select id,tracking_token into result_id,tracking from multisite_orders where id=s.submitted_multisite_order_id;
    else select id,tracking_token into result_id,tracking from orders where id=s.submitted_order_id; end if;
    return jsonb_build_object('id',result_id,'trackingToken',tracking,'multisite',s.submitted_multisite_order_id is not null);
  end if;
  if s.status<>'submitting' or s.bank_submission_token is distinct from p_token or s.bank_submission_until<now() then raise exception 'already-submitting'; end if;
  if exists(select 1 from bank_group_bills bill join bank_qr_test_requests r on r.group_bill_id=bill.id where bill.session_id=s.id
    and r.status not in ('failed','cancelled','paid')) then raise exception 'group-payment-in-progress'; end if;
  if exists(select 1 from bank_group_bills bill where bill.session_id=s.id and bill.voided_at is null and (bill.paid_request_id is not null or bill.mode='cash')
    and bill.items is distinct from (select jsonb_agg(to_jsonb(i) order by i.id) from group_order_items i where i.session_id=s.id and i.participant_id=bill.participant_id and i.restaurant_id=bill.restaurant_id)) then raise exception 'group-bill-items-changed'; end if;
  if jsonb_typeof(p_stops)<>'array' or jsonb_array_length(p_stops) not between 1 and 3 then raise exception 'group-bank-empty'; end if;
  if (select count(distinct restaurant_id) from bank_group_bills where session_id=s.id and voided_at is null and (paid_request_id is not null or mode='cash'))<>jsonb_array_length(p_stops)
    or (select count(distinct value->>'restaurant_id') from jsonb_array_elements(p_stops))<>jsonb_array_length(p_stops) then raise exception 'group-route-changed'; end if;
  all_total:=0;
  for child in select value from jsonb_array_elements(p_stops) loop
    local_id:=(child->>'restaurant_id')::uuid;
    select jsonb_agg(item.value||jsonb_build_object('notes',concat('Participante: ',person.display_name,
      case when coalesce(item.value->>'notes','')<>'' then ' | '||(item.value->>'notes') else '' end)) order by item.value->>'id') into child_items
      from bank_group_bills bill join group_order_participants person on person.id=bill.participant_id cross join lateral jsonb_array_elements(bill.items) item
      where bill.session_id=s.id and bill.restaurant_id=local_id and bill.voided_at is null and (bill.paid_request_id is not null or bill.mode='cash');
    select sum(amount) into local_total from bank_group_bills where session_id=s.id and restaurant_id=local_id and voided_at is null and (paid_request_id is not null or mode='cash');
    if local_total is null or local_total<> (child->>'subtotal')::numeric then raise exception 'group-route-changed'; end if;
    included_count:=included_count+jsonb_array_length(child_items);
    children:=children||jsonb_build_array(child||jsonb_build_object('items',child_items));all_total:=all_total+local_total;
  end loop;
  rider_fee:=coalesce((p_order->>'delivery_fee')::numeric,0);
  if rider_fee<0 or rider_fee>500 then raise exception 'rider-fee'; end if;
  dest:=p_order||jsonb_build_object('payment_method','cash','subtotal',all_total,'total',all_total+rider_fee);
  if jsonb_array_length(children)>1 then
    if p_order->>'order_type'<>'delivery' then raise exception 'multisite-delivery-only'; end if;
    select * into created from create_public_multisite_order_transaction(s.id,dest,children);
    result_id:=created.id;tracking:=created.tracking_token;
    update multisite_orders set bank_group_session_id=s.id where id=result_id;
  else
    child:=children->0;
    select * into created from create_public_order_transaction_before_baneco(s.id,dest||jsonb_build_object(
      'restaurant_id',child->>'restaurant_id','order_number',child->>'order_number','payment_method','cash','requires_prepayment',false,
      'delivery_fee',0,'total',all_total,'discount_total',0,'order_origin','web_checkout'),child->'items');
    result_id:=created.id;tracking:=created.tracking_token;
  end if;
  -- Lock cash sessions deterministically, then order rows, matching settlement.
  for child in select value from jsonb_array_elements(children) order by value->>'restaurant_id' loop
    local_id:=(child->>'restaurant_id')::uuid;
    select id into cash_id from cash_sessions where restaurant_id=local_id and status='open' order by opened_at desc limit 1 for update;
    if cash_id is null then raise exception 'no-open-cash'; end if;
    if jsonb_array_length(children)>1 then select c.order_id into child_order_id from multisite_order_children c where c.multisite_order_id=result_id and c.restaurant_id=local_id;
    else child_order_id:=result_id; end if;
    select sum(amount) filter(where paid_request_id is not null),sum(amount) into prepaid,local_total from bank_group_bills
      where session_id=s.id and restaurant_id=local_id and voided_at is null and (paid_request_id is not null or mode='cash');
    prepaid:=coalesce(prepaid,0);
    select coalesce(r.business_type::text,'food')='food' and coalesce(st.kitchen_enabled,true) into kitchen
      from restaurants r join restaurant_settings st on st.restaurant_id=r.id where r.id=local_id;
    update orders set bank_group_session_id=s.id,group_order_session_id=s.id,group_prepaid_amount=prepaid,group_cash_due=local_total-prepaid,
      payment_status=case when prepaid=local_total then 'paid'::payment_status else 'pending'::payment_status end,
      payment_method=case when prepaid=local_total then 'qr'::payment_method_type else 'cash'::payment_method_type end,
      payment_verified_at=case when prepaid=local_total then now() else null end,
      status=case when prepaid<local_total then 'pending'::order_status when not kitchen and (requested_fulfillment_at is null or requested_fulfillment_at<=now()) then 'ready'::order_status else 'accepted'::order_status end,
      accepted_at=case when prepaid=local_total then now() else null end,ready_at=case when prepaid=local_total and not kitchen and (requested_fulfillment_at is null or requested_fulfillment_at<=now()) then now() else null end
      where id=child_order_id;
    if prepaid=local_total then perform apply_order_inventory_usage(child_order_id); end if;
    for b in select * from bank_group_bills where session_id=s.id and restaurant_id=local_id and voided_at is null and (paid_request_id is not null or mode='cash') for update loop
      update bank_group_bills set order_id=child_order_id where id=b.id;
      if b.paid_request_id is not null then
        select * into receipt from bank_qr_test_requests where id=b.paid_request_id;
        if receipt.status<>'paid' or receipt.amount<>b.amount or receipt.restaurant_id<>local_id or receipt.group_bill_id<>b.id then raise exception 'group-bank-payment-mismatch'; end if;
        insert into cash_movements(restaurant_id,cash_session_id,order_id,type,payment_method,amount,description,created_by,bank_qr_request_id,bank_group_bill_id)
          values(local_id,cash_id,child_order_id,'sale','qr',b.amount,'Pago QR de Yopido Grupal',null,receipt.id,b.id)
          on conflict(bank_group_bill_id) do nothing;
      end if;
    end loop;
  end loop;
  update group_order_sessions set status='submitted',submitted_at=now(),subtotal=all_total,delivery_fee=rider_fee,total=all_total+rider_fee,
    submitted_order_id=case when jsonb_array_length(children)=1 then result_id else null end,
    submitted_multisite_order_id=case when jsonb_array_length(children)>1 then result_id else null end,
    bank_submission_until=null,submitted_snapshot=jsonb_build_object('bankPayments',true,'includedItems',included_count,
      'excludedItems',(select count(*) from group_order_items where session_id=s.id)-included_count,'deliverySeparate',true,'deliveryFee',rider_fee)
    where id=s.id;
  if jsonb_array_length(children)>1 then update multisite_orders set products_prepaid_amount=(select coalesce(sum(group_prepaid_amount),0) from orders where bank_group_session_id=s.id) where id=result_id; end if;
  return jsonb_build_object('id',result_id,'trackingToken',tracking,'multisite',jsonb_array_length(children)>1,'restaurantId',(children->0)->>'restaurant_id');
end $$;
revoke all on function public.finalize_baneco_group(uuid,text,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.finalize_baneco_group(uuid,text,uuid,jsonb,jsonb) to service_role;
