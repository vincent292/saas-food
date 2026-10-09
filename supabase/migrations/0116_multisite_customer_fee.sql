-- Serialize price changes with assignment. A stale offer must never become a
-- dispatch after the customer changes their price.
create or replace function guard_multisite_offer_price()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_order multisite_orders%rowtype;
begin
  select * into v_order from multisite_orders where id = new.multisite_order_id for update;
  if v_order.status not in ('ready_for_dispatch','rider_searching','rider_countered')
    or new.offered_fee <> v_order.delivery_fee
    or exists (select 1 from multisite_delivery_dispatches where multisite_order_id = new.multisite_order_id) then
    raise exception 'multisite-offer-price-stale';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_multisite_offer_price on multisite_rider_offers;
create trigger guard_multisite_offer_price before insert on multisite_rider_offers
for each row execute function guard_multisite_offer_price();

create or replace function guard_multisite_dispatch_offer()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_order multisite_orders%rowtype;
  v_offer multisite_rider_offers%rowtype;
begin
  select * into v_order from multisite_orders where id = new.multisite_order_id for update;
  if v_order.status not in ('ready_for_dispatch','rider_searching','rider_countered') then
    raise exception 'multisite-order-not-available';
  end if;
  select * into v_offer from multisite_rider_offers where id = new.rider_offer_id for update;
  if not found or v_offer.multisite_order_id <> new.multisite_order_id
    or v_offer.restaurant_rider_id <> new.restaurant_rider_id
    or v_offer.rider_user_id is distinct from new.rider_user_id
    or v_offer.status not in ('pending','countered') or v_offer.expires_at <= clock_timestamp()
    or new.accepted_fee <> coalesce(v_offer.counter_fee, v_offer.offered_fee)
    or new.accepted_fee < v_order.rider_fee_minimum or new.accepted_fee > v_order.rider_fee_maximum then
    raise exception 'multisite-rider-offer-not-available';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_multisite_dispatch_offer on multisite_delivery_dispatches;
create trigger guard_multisite_dispatch_offer before insert on multisite_delivery_dispatches
for each row execute function guard_multisite_dispatch_offer();

create or replace function update_multisite_customer_fee(p_order_id uuid, p_tracking_token text, p_fee numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_order multisite_orders%rowtype;
begin
  select * into v_order from multisite_orders where id = p_order_id and tracking_token = p_tracking_token for update;
  if not found then raise exception 'multisite-order-not-found'; end if;
  if v_order.status not in ('submitted','accepted','preparing','ready_for_dispatch','rider_searching','rider_countered')
     or exists (select 1 from multisite_delivery_dispatches where multisite_order_id = p_order_id) then
    raise exception 'multisite-fee-locked';
  end if;
  if p_fee is null or p_fee::text in ('NaN','Infinity','-Infinity') or p_fee <> round(p_fee, 2)
     or p_fee < v_order.rider_fee_minimum or p_fee > v_order.rider_fee_maximum then
    raise exception 'multisite-counter-fee-out-of-range';
  end if;
  if p_fee = v_order.delivery_fee then return jsonb_build_object('deliveryFee',p_fee); end if;
  update multisite_rider_offers set status = 'cancelled', responded_at = now(), response_reason = 'customer-price-updated'
    where multisite_order_id = p_order_id and status in ('pending','countered');
  update multisite_orders set delivery_fee = p_fee, total = subtotal + p_fee,
    status = case when status = 'rider_countered' then 'rider_searching' else status end where id = p_order_id;
  return jsonb_build_object('deliveryFee',p_fee);
end;
$$;

revoke all on function update_multisite_customer_fee(uuid,text,numeric) from public, anon, authenticated;
grant execute on function update_multisite_customer_fee(uuid,text,numeric) to service_role;
