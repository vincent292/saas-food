create or replace function get_public_order_lookup(
  p_restaurant_id uuid,
  p_order_number text,
  p_customer_phone text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
  normalized_phone text;
begin
  normalized_phone := regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g');

  select jsonb_build_object(
    'id', o.id,
    'tracking_token', o.tracking_token
  )
  into result
  from orders o
  where o.restaurant_id = p_restaurant_id
    and lower(o.order_number) = lower(trim(p_order_number))
    and regexp_replace(coalesce(o.customer_phone, ''), '\D', '', 'g') = normalized_phone
  order by o.created_at desc
  limit 1;

  return result;
end;
$$;

grant execute on function get_public_order_lookup(uuid, text, text) to anon, authenticated;
