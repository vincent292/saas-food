-- Serialize changes per customer so a failed edit cannot lose the main address.
create or replace function public.manage_customer_address(
  p_customer_id uuid, p_action text, p_address_id uuid default null, p_address jsonb default '{}'::jsonb
) returns setof public.customer_addresses
language plpgsql security definer set search_path = public
as $$
declare v_id uuid; v_default boolean;
begin
  perform 1 from customer_profiles where id = p_customer_id for update;
  if not found then raise exception 'customer-profile-required'; end if;
  if p_action not in ('create', 'update', 'delete', 'default') then raise exception 'invalid-address-action'; end if;
  if p_action <> 'create' then
    select id, is_default into v_id, v_default from customer_addresses
      where id = p_address_id and customer_id = p_customer_id;
    if not found then raise exception 'address-not-found'; end if;
  end if;
  if p_action in ('create', 'update') then
    if length(trim(coalesce(p_address->>'label', ''))) = 0 or length(trim(coalesce(p_address->>'address', ''))) < 4 then
      raise exception 'invalid-customer-address';
    end if;
    if p_action = 'create' then
      insert into customer_addresses (customer_id, label, address)
        values (p_customer_id, p_address->>'label', p_address->>'address') returning id into v_id;
    end if;
    update customer_addresses set
      label = p_address->>'label', address = p_address->>'address',
      latitude = (p_address->>'latitude')::double precision,
      longitude = (p_address->>'longitude')::double precision,
      maps_url = p_address->>'mapsUrl', city = p_address->>'city',
      apartment = p_address->>'apartment', building_name = p_address->>'buildingName', reference = p_address->>'reference'
    where id = v_id and customer_id = p_customer_id;
  end if;
  if p_action = 'delete' then
    delete from customer_addresses where id = v_id and customer_id = p_customer_id;
  elsif p_action = 'default' or coalesce((p_address->>'isDefault')::boolean, false) then
    update customer_addresses set is_default = false where customer_id = p_customer_id and is_default;
    update customer_addresses set is_default = true where id = v_id and customer_id = p_customer_id;
  end if;
  -- The first address, and a replacement after deleting the main one, become default.
  if not exists (select 1 from customer_addresses where customer_id = p_customer_id and is_default) then
    update customer_addresses set is_default = true where id = (
      select id from customer_addresses where customer_id = p_customer_id order by updated_at desc, id limit 1
    );
  end if;
  return query select * from customer_addresses where customer_id = p_customer_id order by is_default desc, updated_at desc;
end;
$$;
revoke all on function public.manage_customer_address(uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.manage_customer_address(uuid, text, uuid, jsonb) to service_role;
