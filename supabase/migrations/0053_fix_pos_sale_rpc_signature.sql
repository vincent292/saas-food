drop function if exists public.create_pos_sale_with_cash_movement(uuid, text, text, payment_method_type, text, text, jsonb);
drop function if exists public.create_pos_sale_with_cash_movement(uuid, text, text, payment_method_type, text, order_origin, text, text, jsonb);
drop function if exists public.create_pos_sale_with_cash_movement(uuid, text, text, payment_method_type, text, text, jsonb, text, order_origin);

create or replace function public.create_pos_sale_with_cash_movement(
  p_restaurant_id uuid,
  p_order_number text,
  p_customer_name text,
  p_customer_phone text default null,
  p_order_origin order_origin default 'pos_counter',
  p_payment_method payment_method_type default 'cash',
  p_receipt_url text default null,
  p_receipt_reference text default null,
  p_items jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_order_id uuid;
  v_total numeric;
  v_now timestamptz := now();
begin
  if auth.uid() is null or not (is_superadmin() or has_restaurant_role(p_restaurant_id, array['restaurant_admin','cashier']::app_role[])) then
    raise exception 'cash access denied' using errcode = '42501';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'invalid-pos-sale' using errcode = '22023';
  end if;

  if p_payment_method = 'qr' and coalesce(p_receipt_url, p_receipt_reference, '') = '' then
    raise exception 'receipt-required' using errcode = '22023';
  end if;

  select id
    into v_session_id
    from cash_sessions
    where restaurant_id = p_restaurant_id
      and status = 'open'
    order by opened_at desc
    limit 1
    for update;

  if not found then
    raise exception 'no-open-session' using errcode = 'P0002';
  end if;

  if exists (
    with cart as (
      select row_number() over () as line_id, item.*
      from jsonb_to_recordset(p_items) as item(
        "productId" uuid,
        "variantId" uuid,
        "optionIds" jsonb,
        name text,
        price numeric,
        quantity integer,
        notes text
      )
    )
    select 1
    from cart
    left join products p on p.id = cart."productId" and p.restaurant_id = p_restaurant_id
    left join product_variants pv on pv.id = cart."variantId" and pv.restaurant_id = p_restaurant_id
    where p.id is null
      or p.is_available is not true
      or cart.quantity <= 0
      or (cart."variantId" is null and exists (
        select 1
        from product_variants required_pv
        where required_pv.restaurant_id = p_restaurant_id
          and required_pv.product_id = cart."productId"
          and required_pv.is_active is true
      ))
      or (cart."variantId" is not null and (pv.id is null or pv.product_id <> cart."productId" or pv.is_active is not true))
  ) then
    raise exception 'product-not-found' using errcode = '22023';
  end if;

  if exists (
    with cart as (
      select row_number() over () as line_id, item.*
      from jsonb_to_recordset(p_items) as item(
        "productId" uuid,
        "variantId" uuid,
        "optionIds" jsonb,
        name text,
        price numeric,
        quantity integer,
        notes text
      )
    ),
    selected_options as (
      select cart.line_id, cart."productId", selected.option_id::uuid as option_id
      from cart
      cross join lateral jsonb_array_elements_text(coalesce(cart."optionIds", '[]'::jsonb)) as selected(option_id)
    )
    select 1
    from selected_options so
    left join product_options po on po.id = so.option_id and po.restaurant_id = p_restaurant_id
    where po.id is null
      or po.product_id <> so."productId"
      or po.is_active is not true
  ) then
    raise exception 'product-configuration' using errcode = '22023';
  end if;

  if exists (
    with cart as (
      select row_number() over () as line_id, item.*
      from jsonb_to_recordset(p_items) as item(
        "productId" uuid,
        "variantId" uuid,
        "optionIds" jsonb,
        name text,
        price numeric,
        quantity integer,
        notes text
      )
    ),
    selected_options as (
      select cart.line_id, selected.option_id::uuid as option_id
      from cart
      cross join lateral jsonb_array_elements_text(coalesce(cart."optionIds", '[]'::jsonb)) as selected(option_id)
    ),
    group_counts as (
      select so.line_id, po.option_group_id, count(*) as selected_count
      from selected_options so
      join product_options po on po.id = so.option_id and po.restaurant_id = p_restaurant_id and po.is_active is true
      group by so.line_id, po.option_group_id
    )
    select 1
    from cart
    join product_option_groups pog on pog.product_id = cart."productId" and pog.restaurant_id = p_restaurant_id and pog.is_active is true
    left join group_counts gc on gc.line_id = cart.line_id and gc.option_group_id = pog.id
    where coalesce(gc.selected_count, 0) < pog.min_choices
      or coalesce(gc.selected_count, 0) > pog.max_choices
      or (pog.is_required is true and coalesce(gc.selected_count, 0) = 0)
  ) then
    raise exception 'product-configuration' using errcode = '22023';
  end if;

  with cart as (
    select row_number() over () as line_id, item.*
    from jsonb_to_recordset(p_items) as item(
      "productId" uuid,
      "variantId" uuid,
      "optionIds" jsonb,
      name text,
      price numeric,
      quantity integer,
      notes text
    )
  ),
  selected_options as (
    select cart.line_id, selected.option_id::uuid as option_id
    from cart
    cross join lateral jsonb_array_elements_text(coalesce(cart."optionIds", '[]'::jsonb)) as selected(option_id)
  ),
  option_totals as (
    select
      so.line_id,
      coalesce(sum(po.price_delta), 0) as options_total
    from selected_options so
    join product_options po on po.id = so.option_id and po.restaurant_id = p_restaurant_id and po.is_active is true
    group by so.line_id
  ),
  calculated as (
    select
      cart.line_id,
      cart.quantity,
      (p.price + coalesce(pv.price_delta, 0) + coalesce(ot.options_total, 0)) as unit_price
    from cart
    join products p on p.id = cart."productId" and p.restaurant_id = p_restaurant_id
    left join product_variants pv on pv.id = cart."variantId" and pv.restaurant_id = p_restaurant_id
    left join option_totals ot on ot.line_id = cart.line_id
  )
  select coalesce(sum(unit_price * quantity), 0)
    into v_total
    from calculated;

  if v_total <= 0 then
    raise exception 'invalid-pos-sale' using errcode = '22023';
  end if;

  insert into orders (
    restaurant_id,
    order_number,
    customer_name,
    customer_phone,
    order_type,
    order_origin,
    status,
    accepted_at,
    payment_status,
    payment_method,
    payment_receipt_url,
    payment_receipt_uploaded_at,
    payment_receipt_reference,
    payment_verified_at,
    subtotal,
    total
  )
  values (
    p_restaurant_id,
    p_order_number,
    nullif(p_customer_name, ''),
    nullif(p_customer_phone, ''),
    'pos',
    coalesce(p_order_origin, 'pos_counter'::order_origin),
    'accepted',
    v_now,
    'paid',
    p_payment_method,
    p_receipt_url,
    case when p_receipt_url is not null then v_now else null end,
    nullif(p_receipt_reference, ''),
    v_now,
    v_total,
    v_total
  )
  returning id into v_order_id;

  insert into order_items (order_id, product_id, product_name, variant_id, option_ids, unit_price, quantity, subtotal, notes)
  with cart as (
    select row_number() over () as line_id, item.*
    from jsonb_to_recordset(p_items) as item(
      "productId" uuid,
      "variantId" uuid,
      "optionIds" jsonb,
      name text,
      price numeric,
      quantity integer,
      notes text
    )
  ),
  selected_options as (
    select cart.line_id, selected.option_id::uuid as option_id
    from cart
    cross join lateral jsonb_array_elements_text(coalesce(cart."optionIds", '[]'::jsonb)) as selected(option_id)
  ),
  option_details as (
    select
      so.line_id,
      coalesce(sum(po.price_delta), 0) as options_total,
      string_agg(po.name, ' | ' order by po.sort_order) as option_notes
    from selected_options so
    join product_options po on po.id = so.option_id and po.restaurant_id = p_restaurant_id and po.is_active is true
    group by so.line_id
  )
  select
    v_order_id,
    p.id,
    case when pv.id is not null then p.name || ' - ' || pv.name else p.name end,
    pv.id,
    coalesce(
      array(select jsonb_array_elements_text(coalesce(cart."optionIds", '[]'::jsonb))::uuid),
      '{}'::uuid[]
    ),
    p.price + coalesce(pv.price_delta, 0) + coalesce(od.options_total, 0),
    cart.quantity,
    (p.price + coalesce(pv.price_delta, 0) + coalesce(od.options_total, 0)) * cart.quantity,
    nullif(concat_ws(' | ', od.option_notes, nullif(cart.notes, '')), '')
  from cart
  join products p on p.id = cart."productId" and p.restaurant_id = p_restaurant_id
  left join product_variants pv on pv.id = cart."variantId" and pv.restaurant_id = p_restaurant_id
  left join option_details od on od.line_id = cart.line_id;

  insert into cash_movements (restaurant_id, cash_session_id, order_id, type, payment_method, amount, description, created_by)
  values (p_restaurant_id, v_session_id, v_order_id, 'sale', p_payment_method, v_total, 'Venta rapida POS ' || p_order_number, auth.uid());

  return v_order_id;
end;
$$;

grant execute on function public.create_pos_sale_with_cash_movement(uuid, text, text, text, order_origin, payment_method_type, text, text, jsonb) to authenticated;
