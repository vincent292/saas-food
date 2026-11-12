-- One shared claim per order. Ambiguous device writes require an explicit
-- reprint instead of silently producing a duplicate kitchen ticket.
alter table public.orders
  add column pos_print_claim_token uuid,
  add column pos_print_device_id uuid,
  add column pos_print_claimed_at timestamptz,
  add column pos_print_state text check(pos_print_state in ('printing','printed','failed','uncertain')),
  add column pos_print_retry_at timestamptz;

create function public.claim_pos_order_print(p_restaurant_id uuid,p_order_id uuid,p_device_id uuid,p_claim_token uuid,
  p_since timestamptz default null,p_reprint boolean default false) returns jsonb
language plpgsql security definer set search_path=public as $$
declare o orders%rowtype;
begin
  if auth.uid() is null or not (is_superadmin() or has_restaurant_role(p_restaurant_id,array['restaurant_admin','cashier']::app_role[]))
    or exists(select 1 from support_impersonation_sessions where actor_user_id=auth.uid() and status='active' and expires_at>now()) then
    raise exception 'print-forbidden' using errcode='42501';end if;
  if p_device_id is null or p_claim_token is null or p_reprint is null then raise exception 'print-invalid-input';end if;
  select * into o from orders where restaurant_id=p_restaurant_id and id=p_order_id for update;
  if not found then raise exception 'order-not-found';end if;
  if o.bank_checkout_hold or o.bank_schedule_hold or o.status not in ('accepted','preparing','ready','delivered')
    or o.payment_status not in ('pending','paid')
    or (o.payment_method='qr' and o.payment_status<>'paid')
    or (o.bank_payment_required and o.payment_status<>'paid')
    or (not p_reprint and o.status='delivered') then return jsonb_build_object('claimed',false,'reason','not-approved');end if;
  if not p_reprint and o.print_requested_at is not null and exists(select 1 from restaurant_print_connectors c where c.restaurant_id=p_restaurant_id and c.linked_at is not null and c.revoked_at is null) then
    return jsonb_build_object('claimed',false,'reason','desktop-station');end if;
  if o.printed_at is not null and not p_reprint then return jsonb_build_object('claimed',false,'reason','already-printed');end if;
  if p_since is not null and coalesce(o.accepted_at,o.created_at)<p_since and not p_reprint then
    return jsonb_build_object('claimed',false,'reason','before-station');end if;
  if o.pos_print_claim_token=p_claim_token and o.pos_print_device_id=p_device_id then
    return jsonb_build_object('claimed',false,'reason',case when o.pos_print_state='printed' then 'already-printed' else 'uncertain' end);
  end if;
  if o.pos_print_state='printing' then
    if o.pos_print_claimed_at>now()-interval '2 minutes' then return jsonb_build_object('claimed',false,'reason','in-progress');end if;
    update orders set pos_print_state='uncertain' where id=o.id;
    if not p_reprint then return jsonb_build_object('claimed',false,'reason','uncertain');end if;
  elsif o.pos_print_state='uncertain' and not p_reprint then
    return jsonb_build_object('claimed',false,'reason','uncertain');
  end if;
  if o.pos_print_retry_at>now() and not p_reprint then return jsonb_build_object('claimed',false,'reason','retry-later');end if;
  update orders set pos_print_claim_token=p_claim_token,pos_print_device_id=p_device_id,pos_print_claimed_at=now(),
    pos_print_state='printing',pos_print_retry_at=null where id=o.id;
  return jsonb_build_object('claimed',true,'token',p_claim_token);
end $$;

create function public.finish_pos_order_print(p_restaurant_id uuid,p_order_id uuid,p_device_id uuid,p_claim_token uuid,p_result text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or not (is_superadmin() or has_restaurant_role(p_restaurant_id,array['restaurant_admin','cashier']::app_role[]))
    or exists(select 1 from support_impersonation_sessions where actor_user_id=auth.uid() and status='active' and expires_at>now()) then
    raise exception 'print-forbidden' using errcode='42501';end if;
  if p_result is null or p_result not in ('printed','failed','uncertain') then raise exception 'print-invalid-input';end if;
  update orders set pos_print_state=p_result,
    printed_at=case when p_result='printed' then coalesce(printed_at,now()) else printed_at end,
    pos_print_retry_at=case when p_result='failed' then now()+interval '15 seconds' else null end
  where restaurant_id=p_restaurant_id and id=p_order_id and pos_print_device_id=p_device_id
    and pos_print_claim_token=p_claim_token and (pos_print_state='printing' or pos_print_state=p_result);
  return found;
end $$;
revoke all on function public.claim_pos_order_print(uuid,uuid,uuid,uuid,timestamptz,boolean),public.finish_pos_order_print(uuid,uuid,uuid,uuid,text) from public,anon;
grant execute on function public.claim_pos_order_print(uuid,uuid,uuid,uuid,timestamptz,boolean),public.finish_pos_order_print(uuid,uuid,uuid,uuid,text) to authenticated;
