do $$
declare
  epic_id uuid;
  yummy_id uuid;
  v_category_id uuid;
  v_product_id uuid;
  v_option_group_id uuid;
  premium_plan_id uuid;
  active_subscription_id uuid;
  category_row record;
  product_row record;
  option_row record;
begin
  insert into restaurants (
    name,
    slug,
    description,
    status,
    logo_url,
    banner_url,
    primary_color,
    secondary_color,
    whatsapp,
    address,
    city,
    business_type,
    public_category,
    owner_name,
    owner_email,
    background_color,
    surface_color,
    text_color,
    muted_color,
    border_color,
    nav_background_color,
    nav_text_color,
    menu_background_image_url,
    public_banner_size
  )
  values (
    'Epic Wings CBBA',
    'epic-wings-cbba',
    'Alitas, boneless, guarniciones y salsas para probar cocina pasiva, caja y delivery.',
    'active',
    '/imagendefault.jpeg',
    '/imagendefault.jpeg',
    '#F4C400',
    '#1D1D1D',
    '59171449056',
    'Cochabamba',
    'Cochabamba',
    'food',
    'pollo_frito',
    'Equipo Epic Wings Demo',
    'demo@epicwings.test',
    '#FFF8E1',
    '#FFFFFF',
    '#1B1B1B',
    '#6B5B2A',
    '#F2D66B',
    '#1D1D1D',
    '#FFF8D6',
    '/imagendefault.jpeg',
    'standard'
  )
  on conflict (slug) do update
    set name = excluded.name,
        description = excluded.description,
        status = excluded.status,
        logo_url = excluded.logo_url,
        banner_url = excluded.banner_url,
        primary_color = excluded.primary_color,
        secondary_color = excluded.secondary_color,
        whatsapp = excluded.whatsapp,
        address = excluded.address,
        city = excluded.city,
        business_type = excluded.business_type,
        public_category = excluded.public_category,
        owner_name = excluded.owner_name,
        owner_email = excluded.owner_email,
        background_color = excluded.background_color,
        surface_color = excluded.surface_color,
        text_color = excluded.text_color,
        muted_color = excluded.muted_color,
        border_color = excluded.border_color,
        nav_background_color = excluded.nav_background_color,
        nav_text_color = excluded.nav_text_color,
        menu_background_image_url = excluded.menu_background_image_url,
        public_banner_size = excluded.public_banner_size
  returning id into epic_id;

  insert into restaurants (
    name,
    slug,
    description,
    status,
    logo_url,
    banner_url,
    primary_color,
    secondary_color,
    whatsapp,
    address,
    city,
    business_type,
    public_category,
    owner_name,
    owner_email,
    background_color,
    surface_color,
    text_color,
    muted_color,
    border_color,
    nav_background_color,
    nav_text_color,
    menu_background_image_url,
    public_banner_size,
    address_reference
  )
  values (
    'Yummy Chickens',
    'yummy-chickens',
    'Pollo crocante con combos economicos para demo de pedidos, cocina y despacho.',
    'active',
    '/imagendefault.jpeg',
    '/imagendefault.jpeg',
    '#E12D22',
    '#F5A400',
    '59163915511',
    'Av. Independencia esq. Nrios',
    'Cochabamba',
    'food',
    'pollo_frito',
    'Equipo Yummy Demo',
    'demo@yummychickens.test',
    '#16110F',
    '#231814',
    '#FFF5EA',
    '#D8B9A7',
    '#3A2923',
    '#120D0B',
    '#FFF1E2',
    '/imagendefault.jpeg',
    'standard',
    'Paralela al arco de Av. Petrolera'
  )
  on conflict (slug) do update
    set name = excluded.name,
        description = excluded.description,
        status = excluded.status,
        logo_url = excluded.logo_url,
        banner_url = excluded.banner_url,
        primary_color = excluded.primary_color,
        secondary_color = excluded.secondary_color,
        whatsapp = excluded.whatsapp,
        address = excluded.address,
        city = excluded.city,
        business_type = excluded.business_type,
        public_category = excluded.public_category,
        owner_name = excluded.owner_name,
        owner_email = excluded.owner_email,
        background_color = excluded.background_color,
        surface_color = excluded.surface_color,
        text_color = excluded.text_color,
        muted_color = excluded.muted_color,
        border_color = excluded.border_color,
        nav_background_color = excluded.nav_background_color,
        nav_text_color = excluded.nav_text_color,
        menu_background_image_url = excluded.menu_background_image_url,
        public_banner_size = excluded.public_banner_size,
        address_reference = excluded.address_reference
  returning id into yummy_id;

  insert into restaurant_settings (
    restaurant_id,
    delivery_enabled,
    pickup_enabled,
    table_orders_enabled,
    inventory_enabled,
    cash_enabled,
    kitchen_enabled,
    delivery_fee,
    free_delivery_from,
    min_order_amount,
    currency,
    invoice_enabled,
    print_format,
    auto_print_kitchen,
    print_logo,
    delivery_qr_prepayment_enabled,
    far_delivery_distance_km
  )
  values
    (epic_id, true, true, false, false, true, true, 10, 120, 20, 'BOB', false, 'thermal_80', false, true, true, 5),
    (yummy_id, true, true, false, false, true, true, 10, 100, 15, 'BOB', false, 'thermal_80', false, true, true, 5)
  on conflict (restaurant_id) do update
    set delivery_enabled = excluded.delivery_enabled,
        pickup_enabled = excluded.pickup_enabled,
        table_orders_enabled = excluded.table_orders_enabled,
        inventory_enabled = excluded.inventory_enabled,
        cash_enabled = excluded.cash_enabled,
        kitchen_enabled = excluded.kitchen_enabled,
        delivery_fee = excluded.delivery_fee,
        free_delivery_from = excluded.free_delivery_from,
        min_order_amount = excluded.min_order_amount,
        currency = excluded.currency,
        invoice_enabled = excluded.invoice_enabled,
        print_format = excluded.print_format,
        auto_print_kitchen = excluded.auto_print_kitchen,
        print_logo = excluded.print_logo,
        delivery_qr_prepayment_enabled = excluded.delivery_qr_prepayment_enabled,
        far_delivery_distance_km = excluded.far_delivery_distance_km;

  insert into restaurant_queue_settings (
    restaurant_id,
    queue_enabled,
    base_prep_minutes,
    kitchen_capacity,
    min_estimate_minutes,
    max_estimate_minutes,
    item_complexity_minutes
  )
  values
    (epic_id, true, 16, 3, 8, 75, 1.25),
    (yummy_id, true, 15, 3, 8, 70, 1.10)
  on conflict (restaurant_id) do update
    set queue_enabled = excluded.queue_enabled,
        base_prep_minutes = excluded.base_prep_minutes,
        kitchen_capacity = excluded.kitchen_capacity,
        min_estimate_minutes = excluded.min_estimate_minutes,
        max_estimate_minutes = excluded.max_estimate_minutes,
        item_complexity_minutes = excluded.item_complexity_minutes;

  insert into module_settings (restaurant_id, module_key, is_enabled)
  select restaurant_id, module_key, is_enabled
  from (
    values
      (epic_id, 'public_menu', true),
      (epic_id, 'orders', true),
      (epic_id, 'table_qr', false),
      (epic_id, 'kitchen', true),
      (epic_id, 'cash', true),
      (epic_id, 'inventory', false),
      (epic_id, 'reports', true),
      (epic_id, 'multi_user', true),
      (yummy_id, 'public_menu', true),
      (yummy_id, 'orders', true),
      (yummy_id, 'table_qr', false),
      (yummy_id, 'kitchen', true),
      (yummy_id, 'cash', true),
      (yummy_id, 'inventory', false),
      (yummy_id, 'reports', true),
      (yummy_id, 'multi_user', true)
  ) as module_row(restaurant_id, module_key, is_enabled)
  on conflict (restaurant_id, module_key) do update
    set is_enabled = excluded.is_enabled;

  insert into business_hours (restaurant_id, day_of_week, opens_at, closes_at, is_closed)
  select restaurant_id, day_of_week, '11:00'::time, '23:00'::time, false
  from (
    values (epic_id), (yummy_id)
  ) as restaurant_row(restaurant_id)
  cross join generate_series(0, 6) as day_of_week
  on conflict (restaurant_id, day_of_week) do update
    set opens_at = excluded.opens_at,
        closes_at = excluded.closes_at,
        is_closed = excluded.is_closed;

  insert into cash_sessions (restaurant_id, opened_by, closed_by, status, opening_amount, expected_amount, notes)
  select restaurant_id, null, null, 'open', 300, 300, 'Caja demo abierta para probar pedidos, cocina y despacho.'
  from (
    values (epic_id), (yummy_id)
  ) as restaurant_row(restaurant_id)
  where not exists (
    select 1
    from cash_sessions
    where cash_sessions.restaurant_id = restaurant_row.restaurant_id
      and status = 'open'
  );

  select id
  into premium_plan_id
  from subscription_plans
  where key = 'premium'
  limit 1;

  if premium_plan_id is not null then
    for product_row in
      select restaurant_id
      from (values (epic_id), (yummy_id)) as restaurant_row(restaurant_id)
    loop
      select id
      into active_subscription_id
      from restaurant_subscriptions
      where restaurant_id = product_row.restaurant_id
        and status in ('trialing', 'active', 'past_due')
      order by created_at desc
      limit 1;

      if active_subscription_id is null then
        insert into restaurant_subscriptions (restaurant_id, plan_id, status, starts_at, ends_at)
        values (product_row.restaurant_id, premium_plan_id, 'active', now(), null);
      else
        update restaurant_subscriptions
        set plan_id = premium_plan_id,
            status = 'active',
            ends_at = null
        where id = active_subscription_id;
      end if;
    end loop;
  end if;

  for category_row in
    select *
    from (
      values
        ('Boneless', 'Boneless con papa frita y salsa a eleccion.', 10),
        ('Alitas', 'Alitas por cantidad con papa frita y salsas incluidas.', 20),
        ('Guarniciones', 'Acompanamientos para completar el pedido.', 30),
        ('Salsas extra', 'Salsas adicionales para alitas y boneless.', 40)
    ) as category_row(name, description, sort_order)
  loop
    select id
    into v_category_id
    from categories
    where restaurant_id = epic_id
      and lower(name) = lower(category_row.name)
    limit 1;

    if v_category_id is null then
      insert into categories (restaurant_id, name, description, image_url, sort_order, is_active)
      values (epic_id, category_row.name, category_row.description, '/imagendefault.jpeg', category_row.sort_order, true);
    else
      update categories
      set description = category_row.description,
          image_url = '/imagendefault.jpeg',
          sort_order = category_row.sort_order,
          is_active = true
      where id = v_category_id;
    end if;
  end loop;

  for category_row in
    select *
    from (
      values
        ('Combos Yummy', 'Combos de pollo crocante con arroz, papas y salsa.', 10)
    ) as category_row(name, description, sort_order)
  loop
    select id
    into v_category_id
    from categories
    where restaurant_id = yummy_id
      and lower(name) = lower(category_row.name)
    limit 1;

    if v_category_id is null then
      insert into categories (restaurant_id, name, description, image_url, sort_order, is_active)
      values (yummy_id, category_row.name, category_row.description, '/imagendefault.jpeg', category_row.sort_order, true);
    else
      update categories
      set description = category_row.description,
          image_url = '/imagendefault.jpeg',
          sort_order = category_row.sort_order,
          is_active = true
      where id = v_category_id;
    end if;
  end loop;

  for product_row in
    select *
    from (
      values
        ('Boneless', '10 Boneless', 'Acompanado de una porcion de papa frita y salsa a eleccion.', 35::numeric, 14, true, 10, 1),
        ('Alitas', '8 Alitas', 'Acompanado de una porcion de papa frita y salsa a eleccion.', 38::numeric, 15, true, 20, 1),
        ('Alitas', '16 Alitas', 'Acompanado de dos porciones de papa frita y dos salsas a eleccion.', 68::numeric, 18, true, 30, 2),
        ('Alitas', '24 Alitas', 'Acompanado de tres porciones de papa frita y tres salsas a eleccion.', 98::numeric, 22, true, 40, 3),
        ('Alitas', '32 Alitas', 'Acompanado de cuatro porciones de papa frita y cuatro salsas a eleccion.', 138::numeric, 26, false, 50, 4),
        ('Alitas', 'Combo Familiar 50 Alitas', 'Acompanado de cinco porciones de papa frita y cinco salsas a eleccion.', 170::numeric, 32, true, 60, 5),
        ('Guarniciones', 'Porcion papas fritas', 'Papas fritas clasicas para acompanar el pedido.', 10::numeric, 8, false, 70, 0),
        ('Guarniciones', 'Aros de cebolla', 'Aros de cebolla crocantes.', 12::numeric, 8, false, 80, 0),
        ('Guarniciones', 'Papas de la casa', 'Papas fritas banadas en queso cheddar y trozos de tocino.', 35::numeric, 12, true, 90, 0),
        ('Salsas extra', 'Salsa picante', 'Salsa extra sabor picante.', 7::numeric, 2, false, 100, 0),
        ('Salsas extra', 'Salsa miel mostaza', 'Salsa extra sabor miel mostaza.', 7::numeric, 2, false, 110, 0),
        ('Salsas extra', 'Salsa barbacoa', 'Salsa extra sabor barbacoa.', 7::numeric, 2, false, 120, 0),
        ('Salsas extra', 'Salsa barbacoa picante', 'Salsa extra sabor barbacoa picante.', 7::numeric, 2, false, 130, 0),
        ('Salsas extra', 'Salsa lemon pepper', 'Salsa extra sabor lemon pepper.', 7::numeric, 2, false, 140, 0),
        ('Salsas extra', 'Salsa especial del mes', 'Salsa extra rotativa especial del mes.', 7::numeric, 2, false, 150, 0)
    ) as product_row(category_name, name, description, price, prep_minutes, is_featured, sort_order, included_sauces)
  loop
    select id
    into v_category_id
    from categories
    where restaurant_id = epic_id
      and lower(name) = lower(product_row.category_name)
    limit 1;

    select id
    into v_product_id
    from products
    where restaurant_id = epic_id
      and lower(name) = lower(product_row.name)
    limit 1;

    if v_product_id is null then
      insert into products (
        restaurant_id,
        category_id,
        name,
        description,
        price,
        prep_minutes,
        image_url,
        is_available,
        is_featured,
        track_stock,
        product_kind,
        sort_order
      )
      values (
        epic_id,
        v_category_id,
        product_row.name,
        product_row.description,
        product_row.price,
        product_row.prep_minutes,
        '/imagendefault.jpeg',
        true,
        product_row.is_featured,
        false,
        'standard',
        product_row.sort_order
      )
      returning id into v_product_id;
    else
      update products
      set category_id = v_category_id,
          description = product_row.description,
          price = product_row.price,
          prep_minutes = product_row.prep_minutes,
          image_url = '/imagendefault.jpeg',
          is_available = true,
          is_featured = product_row.is_featured,
          track_stock = false,
          product_kind = 'standard',
          sort_order = product_row.sort_order
      where id = v_product_id;
    end if;

    if product_row.included_sauces > 0 then
      select id
      into v_option_group_id
      from product_option_groups
      where restaurant_id = epic_id
        and product_id = v_product_id
        and lower(name) = lower('Salsa incluida')
      limit 1;

      if v_option_group_id is null then
        insert into product_option_groups (
          restaurant_id,
          product_id,
          name,
          description,
          min_choices,
          max_choices,
          is_required,
          sort_order,
          is_active
        )
        values (
          epic_id,
          v_product_id,
          'Salsa incluida',
          'Elige las salsas incluidas en este combo.',
          1,
          product_row.included_sauces,
          true,
          10,
          true
        )
        returning id into v_option_group_id;
      else
        update product_option_groups
        set description = 'Elige las salsas incluidas en este combo.',
            min_choices = 1,
            max_choices = product_row.included_sauces,
            is_required = true,
            sort_order = 10,
            is_active = true
        where id = v_option_group_id;
      end if;

      for option_row in
        select *
        from (
          values
            ('Picante', 'Picante clasica.', 10),
            ('Miel mostaza', 'Dulce y cremosa.', 20),
            ('Barbacoa', 'BBQ clasica.', 30),
            ('Barbacoa picante', 'BBQ con picor.', 40),
            ('Lemon pepper', 'Citricos y pimienta.', 50),
            ('Especial del mes', 'Salsa rotativa de la casa.', 60)
        ) as option_row(name, description, sort_order)
      loop
        insert into product_options (
          restaurant_id,
          product_id,
          option_group_id,
          name,
          description,
          price_delta,
          sort_order,
          is_active
        )
        select epic_id, v_product_id, v_option_group_id, option_row.name, option_row.description, 0, option_row.sort_order, true
        where not exists (
          select 1
          from product_options
          where restaurant_id = epic_id
            and product_id = v_product_id
            and option_group_id = v_option_group_id
            and lower(name) = lower(option_row.name)
        );
      end loop;
    end if;
  end loop;

  for product_row in
    select *
    from (
      values
        ('Combos Yummy', 'Eco Yummy', 'Combo economico con presa crocante, arroz, papas fritas y salsa.', 15::numeric, 12, true, 10),
        ('Combos Yummy', 'Crocant Yummy', 'Pollo crocante con arroz, papas fritas y salsa de la casa.', 24::numeric, 15, true, 20),
        ('Combos Yummy', 'Super Yummy', 'Porcion completa de pollo crocante con arroz, papas fritas y salsa.', 35::numeric, 18, true, 30),
        ('Combos Yummy', 'Mega Yummy', 'Combo grande de pollo crocante para hambre fuerte.', 42::numeric, 22, true, 40)
    ) as product_row(category_name, name, description, price, prep_minutes, is_featured, sort_order)
  loop
    select id
    into v_category_id
    from categories
    where restaurant_id = yummy_id
      and lower(name) = lower(product_row.category_name)
    limit 1;

    select id
    into v_product_id
    from products
    where restaurant_id = yummy_id
      and lower(name) = lower(product_row.name)
    limit 1;

    if v_product_id is null then
      insert into products (
        restaurant_id,
        category_id,
        name,
        description,
        price,
        prep_minutes,
        image_url,
        is_available,
        is_featured,
        track_stock,
        product_kind,
        sort_order
      )
      values (
        yummy_id,
        v_category_id,
        product_row.name,
        product_row.description,
        product_row.price,
        product_row.prep_minutes,
        '/imagendefault.jpeg',
        true,
        product_row.is_featured,
        false,
        'standard',
        product_row.sort_order
      );
    else
      update products
      set category_id = v_category_id,
          description = product_row.description,
          price = product_row.price,
          prep_minutes = product_row.prep_minutes,
          image_url = '/imagendefault.jpeg',
          is_available = true,
          is_featured = product_row.is_featured,
          track_stock = false,
          product_kind = 'standard',
          sort_order = product_row.sort_order
      where id = v_product_id;
    end if;
  end loop;
end $$;
