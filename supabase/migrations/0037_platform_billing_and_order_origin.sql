do $$ begin
  create type order_origin as enum ('pos_counter', 'table_qr', 'web_checkout', 'phone_whatsapp', 'external_platform');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type owner_change_request_status as enum ('pending', 'approved', 'rejected', 'cancelled');
exception when duplicate_object then null;
end $$;

alter table orders
  add column if not exists order_origin order_origin;

update orders
set order_origin = case
  when order_type = 'table' then 'table_qr'::order_origin
  when order_type in ('delivery', 'pickup') then 'web_checkout'::order_origin
  else 'pos_counter'::order_origin
end
where order_origin is null;

alter table orders
  alter column order_origin set default 'pos_counter';

alter table orders
  alter column order_origin set not null;

create table if not exists restaurant_platform_billing (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  billing_anchor_date date not null,
  next_due_date date not null,
  reminder_days integer not null default 4 check (reminder_days >= 0 and reminder_days <= 15),
  platform_qr_url text,
  platform_qr_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id)
);

create table if not exists restaurant_platform_payment_cycles (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  due_date date not null,
  proof_url text,
  proof_uploaded_at timestamptz,
  proof_verified_at timestamptz,
  proof_verified_by uuid references profiles(id) on delete set null,
  paid_at timestamptz,
  paid_by uuid references profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, due_date)
);

create table if not exists restaurant_owner_change_requests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  requested_by uuid not null references profiles(id) on delete cascade,
  current_owner_name text,
  current_owner_email text,
  requested_owner_name text not null,
  requested_owner_email text not null,
  reason text,
  eligible_at timestamptz not null default now(),
  status owner_change_request_status not null default 'pending',
  approved_at timestamptz,
  approved_by uuid references profiles(id) on delete set null,
  rejected_at timestamptz,
  rejected_by uuid references profiles(id) on delete set null,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_platform_billing_due_date on restaurant_platform_billing(next_due_date);
create index if not exists idx_platform_payment_cycles_due_date on restaurant_platform_payment_cycles(restaurant_id, due_date desc);
create index if not exists idx_owner_change_requests_status on restaurant_owner_change_requests(restaurant_id, status, created_at desc);

drop trigger if exists restaurant_platform_billing_updated_at on restaurant_platform_billing;
create trigger restaurant_platform_billing_updated_at before update on restaurant_platform_billing for each row execute function set_updated_at();

drop trigger if exists restaurant_platform_payment_cycles_updated_at on restaurant_platform_payment_cycles;
create trigger restaurant_platform_payment_cycles_updated_at before update on restaurant_platform_payment_cycles for each row execute function set_updated_at();

drop trigger if exists restaurant_owner_change_requests_updated_at on restaurant_owner_change_requests;
create trigger restaurant_owner_change_requests_updated_at before update on restaurant_owner_change_requests for each row execute function set_updated_at();

alter table restaurant_platform_billing enable row level security;
alter table restaurant_platform_payment_cycles enable row level security;
alter table restaurant_owner_change_requests enable row level security;

drop policy if exists "members read platform billing" on restaurant_platform_billing;
create policy "members read platform billing" on restaurant_platform_billing
for select using (
  is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier','kitchen','waiter']::app_role[])
);

drop policy if exists "superadmin manages platform billing" on restaurant_platform_billing;
create policy "superadmin manages platform billing" on restaurant_platform_billing
for all using (is_superadmin())
with check (is_superadmin());

drop policy if exists "members read platform payment cycles" on restaurant_platform_payment_cycles;
create policy "members read platform payment cycles" on restaurant_platform_payment_cycles
for select using (
  is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier','kitchen','waiter']::app_role[])
);

drop policy if exists "restaurant admins upload platform payment cycles" on restaurant_platform_payment_cycles;
create policy "restaurant admins upload platform payment cycles" on restaurant_platform_payment_cycles
for insert to authenticated with check (
  is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[])
);

drop policy if exists "restaurant admins update platform payment cycles" on restaurant_platform_payment_cycles;
create policy "restaurant admins update platform payment cycles" on restaurant_platform_payment_cycles
for update using (
  is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[])
)
with check (
  is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[])
);

drop policy if exists "members read owner change requests" on restaurant_owner_change_requests;
create policy "members read owner change requests" on restaurant_owner_change_requests
for select using (
  is_superadmin() or has_restaurant_role(restaurant_id, array['restaurant_admin','cashier','kitchen','waiter']::app_role[])
);

drop policy if exists "restaurant admins create owner change requests" on restaurant_owner_change_requests;
create policy "restaurant admins create owner change requests" on restaurant_owner_change_requests
for insert to authenticated with check (
  has_restaurant_role(restaurant_id, array['restaurant_admin']::app_role[]) and requested_by = auth.uid()
);

drop policy if exists "superadmin manages owner change requests" on restaurant_owner_change_requests;
create policy "superadmin manages owner change requests" on restaurant_owner_change_requests
for all using (is_superadmin())
with check (is_superadmin());

grant select on restaurant_platform_billing to authenticated;
grant select, insert, update on restaurant_platform_payment_cycles to authenticated;
grant select, insert, update on restaurant_owner_change_requests to authenticated;

drop function if exists create_pos_sale_with_cash_movement(uuid, text, text, payment_method_type, text, text, jsonb);

create or replace function create_pos_sale_with_cash_movement(
  p_restaurant_id uuid,
  p_order_number text,
  p_customer_name text,
  p_payment_method payment_method_type,
  p_customer_phone text default null,
  p_order_origin order_origin default 'pos_counter',
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

  insert into order_items (order_id, product_id, product_name, unit_price, quantity, subtotal, notes)
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

grant execute on function create_pos_sale_with_cash_movement(uuid, text, text, payment_method_type, text, order_origin, text, text, jsonb) to authenticated;

create or replace function claim_restaurant_access_session(
  p_restaurant_id uuid,
  p_ip_address text default null,
  p_user_agent text default null
)
returns table (
  allowed boolean,
  session_id uuid,
  restaurant_id uuid,
  restaurant_name text,
  active_restaurant_id uuid,
  active_restaurant_name text,
  active_ip_address text,
  active_last_seen_at timestamptz,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role app_role;
  v_restaurant_name text;
  v_session_id uuid;
  v_conflict restaurant_access_sessions%rowtype;
  v_conflict_restaurant_name text;
begin
  if v_user_id is null then
    raise exception 'session-required' using errcode = '42501';
  end if;

  select name into v_restaurant_name
  from restaurants
  where id = p_restaurant_id
    and deleted_at is null;

  if v_restaurant_name is null then
    raise exception 'restaurant-not-active' using errcode = '42501';
  end if;

  if is_superadmin() then
    allowed := true;
    session_id := null;
    restaurant_id := p_restaurant_id;
    restaurant_name := v_restaurant_name;
    active_restaurant_id := null;
    active_restaurant_name := null;
    active_ip_address := null;
    active_last_seen_at := null;
    message := 'superadmin-bypass';
    return next;
    return;
  end if;

  select rm.role into v_role
  from restaurant_memberships rm
  where rm.restaurant_id = p_restaurant_id
    and rm.user_id = v_user_id
    and rm.is_active = true
  order by case rm.role when 'restaurant_admin' then 1 when 'cashier' then 2 when 'kitchen' then 3 when 'waiter' then 4 else 5 end
  limit 1;

  if v_role is null then
    raise exception 'restaurant-access-denied' using errcode = '42501';
  end if;

  if v_role not in ('restaurant_admin', 'cashier') then
    allowed := true;
    session_id := null;
    restaurant_id := p_restaurant_id;
    restaurant_name := v_restaurant_name;
    active_restaurant_id := null;
    active_restaurant_name := null;
    active_ip_address := null;
    active_last_seen_at := null;
    message := 'role-not-restricted';
    return next;
    return;
  end if;

  perform expire_stale_restaurant_access_sessions();

  select ras.* into v_conflict
  from restaurant_access_sessions ras
  where ras.user_id = v_user_id
    and ras.status = 'active'
    and ras.expires_at >= now()
    and ras.restaurant_id <> p_restaurant_id
  order by ras.last_seen_at desc
  limit 1;

  if v_conflict.id is not null then
    select name into v_conflict_restaurant_name from restaurants where id = v_conflict.restaurant_id;

    perform write_admin_audit(
      'restaurant_access_blocked',
      'restaurant_access_session',
      v_conflict.id,
      p_restaurant_id,
      'warning',
      p_ip_address,
      p_user_agent,
      jsonb_build_object('active_restaurant_id', v_conflict.restaurant_id, 'active_restaurant_name', v_conflict_restaurant_name)
    );

    allowed := false;
    session_id := v_conflict.id;
    restaurant_id := p_restaurant_id;
    restaurant_name := v_restaurant_name;
    active_restaurant_id := v_conflict.restaurant_id;
    active_restaurant_name := v_conflict_restaurant_name;
    active_ip_address := v_conflict.ip_address;
    active_last_seen_at := v_conflict.last_seen_at;
    message := 'restaurant-session-conflict';
    return next;
    return;
  end if;

  update restaurant_access_sessions
  set
    ip_address = nullif(p_ip_address, ''),
    user_agent = nullif(p_user_agent, ''),
    last_seen_at = now(),
    expires_at = now() + interval '30 minutes'
  where user_id = v_user_id
    and restaurant_id = p_restaurant_id
    and status = 'active'
  returning id into v_session_id;

  if v_session_id is null then
    insert into restaurant_access_sessions (
      restaurant_id,
      user_id,
      role,
      ip_address,
      user_agent
    )
    values (
      p_restaurant_id,
      v_user_id,
      v_role,
      nullif(p_ip_address, ''),
      nullif(p_user_agent, '')
    )
    returning id into v_session_id;

    perform write_admin_audit(
      'restaurant_access_claimed',
      'restaurant_access_session',
      v_session_id,
      p_restaurant_id,
      'info',
      p_ip_address,
      p_user_agent,
      jsonb_build_object('role', v_role)
    );
  end if;

  allowed := true;
  session_id := v_session_id;
  restaurant_id := p_restaurant_id;
  restaurant_name := v_restaurant_name;
  active_restaurant_id := null;
  active_restaurant_name := null;
  active_ip_address := null;
  active_last_seen_at := null;
  message := 'restaurant-session-active';
  return next;
end;
$$;

grant execute on function claim_restaurant_access_session(uuid, text, text) to authenticated;
