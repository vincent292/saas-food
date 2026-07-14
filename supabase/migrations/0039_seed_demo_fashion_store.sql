do $$
declare
  demo_restaurant_id uuid;
  premium_plan_id uuid;
  active_subscription_id uuid;
  demo_zone_id uuid;
  demo_supplier_id uuid;
  inventory_category_garments_id uuid;
  inventory_category_accessories_id uuid;
  category_new_arrivals_id uuid;
  category_dresses_id uuid;
  category_blazers_id uuid;
  category_denim_id uuid;
  category_accessories_id uuid;
  product_dress_id uuid;
  product_blazer_id uuid;
  product_jean_id uuid;
  product_blouse_id uuid;
  product_bag_id uuid;
  inventory_dress_id uuid;
  inventory_blazer_id uuid;
  inventory_jean_id uuid;
  inventory_blouse_id uuid;
  inventory_bag_id uuid;
  current_option_group_id uuid;
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
    public_banner_size,
    maps_url,
    address_reference
  )
  values (
    'Brisa Urbana Boutique',
    'brisa-urbana-demo',
    'Boutique demo para probar catalogo, caja, pedidos, delivery e inventario sin cocina ni mesas.',
    'active',
    '/imagendefault.jpeg',
    '/imagendefault.jpeg',
    '#C95D4B',
    '#E8B49B',
    '59171234567',
    'Av. America 1024',
    'Cochabamba',
    'fashion',
    'ropa_mujer',
    'Equipo Demo Brisa Urbana',
    'demo-ropa@brisaurbana.test',
    '#FFF8F3',
    '#FFFFFF',
    '#2E1F1A',
    '#6F5951',
    '#E8D5CC',
    '#FFF2EB',
    '#2E1F1A',
    '/imagendefault.jpeg',
    'standard',
    'https://maps.google.com/?q=Av.+America+1024+Cochabamba',
    'Segundo piso, local 12'
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
        maps_url = excluded.maps_url,
        address_reference = excluded.address_reference
  returning id into demo_restaurant_id;

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
    qr_payment_url,
    qr_account_name,
    qr_account_document,
    qr_bank_name,
    qr_account_type,
    qr_currency,
    print_format,
    auto_print_kitchen,
    print_logo
  )
  values (
    demo_restaurant_id,
    true,
    true,
    false,
    true,
    true,
    false,
    15,
    350,
    50,
    'BOB',
    true,
    '/imagendefault.jpeg',
    'Brisa Urbana Boutique',
    '7894561',
    'Banco Demo',
    'Caja de ahorro',
    'BOB',
    'thermal_80',
    false,
    true
  )
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
        qr_payment_url = excluded.qr_payment_url,
        qr_account_name = excluded.qr_account_name,
        qr_account_document = excluded.qr_account_document,
        qr_bank_name = excluded.qr_bank_name,
        qr_account_type = excluded.qr_account_type,
        qr_currency = excluded.qr_currency,
        print_format = excluded.print_format,
        auto_print_kitchen = excluded.auto_print_kitchen,
        print_logo = excluded.print_logo;

  select id
  into premium_plan_id
  from subscription_plans
  where key = 'premium'
  limit 1;

  if premium_plan_id is not null then
    select id
    into active_subscription_id
    from restaurant_subscriptions
    where restaurant_id = demo_restaurant_id
      and status in ('trialing', 'active', 'past_due')
    order by created_at desc
    limit 1;

    if active_subscription_id is null then
      insert into restaurant_subscriptions (restaurant_id, plan_id, status, starts_at, ends_at)
      values (demo_restaurant_id, premium_plan_id, 'active', now(), null);
    else
      update restaurant_subscriptions
      set plan_id = premium_plan_id,
          status = 'active',
          ends_at = null
      where id = active_subscription_id;
    end if;
  end if;

  insert into module_settings (restaurant_id, module_key, is_enabled)
  select demo_restaurant_id, module_key, is_enabled
  from (
    values
      ('public_menu', true),
      ('orders', true),
      ('table_qr', false),
      ('kitchen', false),
      ('cash', true),
      ('inventory', true),
      ('reports', true),
      ('multi_user', true)
  ) as module_row(module_key, is_enabled)
  on conflict (restaurant_id, module_key) do update
    set is_enabled = excluded.is_enabled;

  insert into business_hours (restaurant_id, day_of_week, opens_at, closes_at, is_closed)
  select demo_restaurant_id, day_of_week, '00:00'::time, '23:59'::time, false
  from generate_series(0, 6) as day_of_week
  on conflict (restaurant_id, day_of_week) do update
    set opens_at = excluded.opens_at,
        closes_at = excluded.closes_at,
        is_closed = excluded.is_closed;

  insert into cash_sessions (
    restaurant_id,
    opened_by,
    closed_by,
    status,
    opening_amount,
    expected_amount,
    notes
  )
  select demo_restaurant_id, null, null, 'open', 800, 800, 'Caja demo abierta para pruebas del flujo multirubro.'
  where not exists (
    select 1 from cash_sessions where restaurant_id = demo_restaurant_id and status = 'open'
  );

  insert into inventory_categories (restaurant_id, name, description, is_active)
  values (demo_restaurant_id, 'Prendas', 'Prendas principales para la boutique demo.', true)
  on conflict (restaurant_id, name) do update
    set description = excluded.description,
        is_active = excluded.is_active
  returning id into inventory_category_garments_id;

  if inventory_category_garments_id is null then
    select id into inventory_category_garments_id
    from inventory_categories
    where restaurant_id = demo_restaurant_id and name = 'Prendas'
    limit 1;
  end if;

  insert into inventory_categories (restaurant_id, name, description, is_active)
  values (demo_restaurant_id, 'Accesorios', 'Accesorios y complementos de la boutique demo.', true)
  on conflict (restaurant_id, name) do update
    set description = excluded.description,
        is_active = excluded.is_active
  returning id into inventory_category_accessories_id;

  if inventory_category_accessories_id is null then
    select id into inventory_category_accessories_id
    from inventory_categories
    where restaurant_id = demo_restaurant_id and name = 'Accesorios'
    limit 1;
  end if;

  select id
  into demo_supplier_id
  from inventory_suppliers
  where restaurant_id = demo_restaurant_id
    and lower(name) = lower('Distribuidora Demo Textil')
  limit 1;

  if demo_supplier_id is null then
    insert into inventory_suppliers (restaurant_id, name, phone, notes, is_active)
    values (demo_restaurant_id, 'Distribuidora Demo Textil', '59170011122', 'Proveedor ficticio para pruebas del panel.', true)
    returning id into demo_supplier_id;
  end if;

  demo_zone_id := create_default_inventory_zone(demo_restaurant_id);

  select id
  into category_new_arrivals_id
  from categories
  where restaurant_id = demo_restaurant_id
    and lower(name) = lower('Nuevos ingresos')
  limit 1;

  if category_new_arrivals_id is null then
    insert into categories (restaurant_id, name, description, image_url, sort_order, is_active)
    values (demo_restaurant_id, 'Nuevos ingresos', 'Lo mas reciente de la boutique demo.', '/imagendefault.jpeg', 10, true)
    returning id into category_new_arrivals_id;
  end if;

  select id
  into category_dresses_id
  from categories
  where restaurant_id = demo_restaurant_id
    and lower(name) = lower('Vestidos y sets')
  limit 1;

  if category_dresses_id is null then
    insert into categories (restaurant_id, name, description, image_url, sort_order, is_active)
    values (demo_restaurant_id, 'Vestidos y sets', 'Vestidos listos para recojo o delivery.', '/imagendefault.jpeg', 20, true)
    returning id into category_dresses_id;
  end if;

  select id
  into category_blazers_id
  from categories
  where restaurant_id = demo_restaurant_id
    and lower(name) = lower('Blazers y chaquetas')
  limit 1;

  if category_blazers_id is null then
    insert into categories (restaurant_id, name, description, image_url, sort_order, is_active)
    values (demo_restaurant_id, 'Blazers y chaquetas', 'Capas y piezas de estructura ligera.', '/imagendefault.jpeg', 30, true)
    returning id into category_blazers_id;
  end if;

  select id
  into category_denim_id
  from categories
  where restaurant_id = demo_restaurant_id
    and lower(name) = lower('Denim')
  limit 1;

  if category_denim_id is null then
    insert into categories (restaurant_id, name, description, image_url, sort_order, is_active)
    values (demo_restaurant_id, 'Denim', 'Jeans y piezas casuales para pruebas.', '/imagendefault.jpeg', 40, true)
    returning id into category_denim_id;
  end if;

  select id
  into category_accessories_id
  from categories
  where restaurant_id = demo_restaurant_id
    and lower(name) = lower('Accesorios')
  limit 1;

  if category_accessories_id is null then
    insert into categories (restaurant_id, name, description, image_url, sort_order, is_active)
    values (demo_restaurant_id, 'Accesorios', 'Bolsos y complementos de la demo.', '/imagendefault.jpeg', 50, true)
    returning id into category_accessories_id;
  end if;

  select id
  into product_dress_id
  from products
  where restaurant_id = demo_restaurant_id
    and lower(name) = lower('Vestido Aurora')
  limit 1;

  if product_dress_id is null then
    insert into products (restaurant_id, category_id, name, description, price, image_url, is_available, is_featured, track_stock, sort_order)
    values (demo_restaurant_id, category_dresses_id, 'Vestido Aurora', 'Vestido midi con caida ligera para probar tallas, color y extras.', 189.90, '/imagendefault.jpeg', true, true, true, 10)
    returning id into product_dress_id;
  else
    update products
    set category_id = category_dresses_id,
        description = 'Vestido midi con caida ligera para probar tallas, color y extras.',
        price = 189.90,
        image_url = '/imagendefault.jpeg',
        is_available = true,
        is_featured = true,
        track_stock = true,
        sort_order = 10
    where id = product_dress_id;
  end if;

  insert into product_variants (restaurant_id, product_id, name, description, price_delta, sort_order, is_active)
  select demo_restaurant_id, product_dress_id, variant.name, variant.description, variant.price_delta, variant.sort_order, true
  from (
    values
      ('XS', 'Talla extra pequena.', 0::numeric, 10),
      ('S', 'Talla pequena.', 0::numeric, 20),
      ('M', 'Talla mediana.', 0::numeric, 30),
      ('L', 'Talla grande.', 0::numeric, 40)
  ) as variant(name, description, price_delta, sort_order)
  where not exists (
    select 1
    from product_variants
    where restaurant_id = demo_restaurant_id
      and product_id = product_dress_id
      and lower(name) = lower(variant.name)
  );

  select id into current_option_group_id
  from product_option_groups
  where restaurant_id = demo_restaurant_id
    and product_id = product_dress_id
    and lower(name) = lower('Color')
  limit 1;

  if current_option_group_id is null then
    insert into product_option_groups (restaurant_id, product_id, name, description, min_choices, max_choices, is_required, sort_order, is_active)
    values (demo_restaurant_id, product_dress_id, 'Color', 'Elige el color principal.', 1, 1, true, 10, true)
    returning id into current_option_group_id;
  end if;

  insert into product_options (restaurant_id, product_id, option_group_id, name, description, price_delta, sort_order, is_active)
  select demo_restaurant_id, product_dress_id, current_option_group_id, option_row.name, option_row.description, option_row.price_delta, option_row.sort_order, true
  from (
    values
      ('Negro', 'Color base elegante.', 0::numeric, 10),
      ('Champagne', 'Tono neutro suave.', 0::numeric, 20),
      ('Terracota', 'Tono calido editorial.', 0::numeric, 30)
  ) as option_row(name, description, price_delta, sort_order)
  where not exists (
    select 1
    from product_options
    where restaurant_id = demo_restaurant_id
      and product_id = product_dress_id
      and option_group_id = current_option_group_id
      and lower(name) = lower(option_row.name)
  );

  select id into current_option_group_id
  from product_option_groups
  where restaurant_id = demo_restaurant_id
    and product_id = product_dress_id
    and lower(name) = lower('Extras')
  limit 1;

  if current_option_group_id is null then
    insert into product_option_groups (restaurant_id, product_id, name, description, min_choices, max_choices, is_required, sort_order, is_active)
    values (demo_restaurant_id, product_dress_id, 'Extras', 'Servicios y complementos para la entrega.', 0, 2, false, 20, true)
    returning id into current_option_group_id;
  end if;

  insert into product_options (restaurant_id, product_id, option_group_id, name, description, price_delta, sort_order, is_active)
  select demo_restaurant_id, product_dress_id, current_option_group_id, option_row.name, option_row.description, option_row.price_delta, option_row.sort_order, true
  from (
    values
      ('Empaque regalo', 'Bolsa y papel de regalo.', 12::numeric, 10),
      ('Ajuste express', 'Preparacion prioritaria del pedido.', 25::numeric, 20)
  ) as option_row(name, description, price_delta, sort_order)
  where not exists (
    select 1
    from product_options
    where restaurant_id = demo_restaurant_id
      and product_id = product_dress_id
      and option_group_id = current_option_group_id
      and lower(name) = lower(option_row.name)
  );

  select id
  into product_blazer_id
  from products
  where restaurant_id = demo_restaurant_id
    and lower(name) = lower('Blazer Siena')
  limit 1;

  if product_blazer_id is null then
    insert into products (restaurant_id, category_id, name, description, price, image_url, is_available, is_featured, track_stock, sort_order)
    values (demo_restaurant_id, category_blazers_id, 'Blazer Siena', 'Blazer estructurado para probar variantes y flujo de preparacion.', 249.90, '/imagendefault.jpeg', true, true, true, 20)
    returning id into product_blazer_id;
  else
    update products
    set category_id = category_blazers_id,
        description = 'Blazer estructurado para probar variantes y flujo de preparacion.',
        price = 249.90,
        image_url = '/imagendefault.jpeg',
        is_available = true,
        is_featured = true,
        track_stock = true,
        sort_order = 20
    where id = product_blazer_id;
  end if;

  insert into product_variants (restaurant_id, product_id, name, description, price_delta, sort_order, is_active)
  select demo_restaurant_id, product_blazer_id, variant.name, variant.description, variant.price_delta, variant.sort_order, true
  from (
    values
      ('S', 'Corte pequeno.', 0::numeric, 10),
      ('M', 'Corte medio.', 0::numeric, 20),
      ('L', 'Corte amplio.', 0::numeric, 30)
  ) as variant(name, description, price_delta, sort_order)
  where not exists (
    select 1
    from product_variants
    where restaurant_id = demo_restaurant_id
      and product_id = product_blazer_id
      and lower(name) = lower(variant.name)
  );

  select id into current_option_group_id
  from product_option_groups
  where restaurant_id = demo_restaurant_id
    and product_id = product_blazer_id
    and lower(name) = lower('Color')
  limit 1;

  if current_option_group_id is null then
    insert into product_option_groups (restaurant_id, product_id, name, description, min_choices, max_choices, is_required, sort_order, is_active)
    values (demo_restaurant_id, product_blazer_id, 'Color', 'Elige el tono del blazer.', 1, 1, true, 10, true)
    returning id into current_option_group_id;
  end if;

  insert into product_options (restaurant_id, product_id, option_group_id, name, description, price_delta, sort_order, is_active)
  select demo_restaurant_id, product_blazer_id, current_option_group_id, option_row.name, option_row.description, option_row.price_delta, option_row.sort_order, true
  from (
    values
      ('Arena', 'Tono neutro editorial.', 0::numeric, 10),
      ('Negro', 'Clasico para oficina.', 0::numeric, 20),
      ('Verde oliva', 'Opcion casual.', 0::numeric, 30)
  ) as option_row(name, description, price_delta, sort_order)
  where not exists (
    select 1
    from product_options
    where restaurant_id = demo_restaurant_id
      and product_id = product_blazer_id
      and option_group_id = current_option_group_id
      and lower(name) = lower(option_row.name)
  );

  select id
  into product_jean_id
  from products
  where restaurant_id = demo_restaurant_id
    and lower(name) = lower('Jean Recto Alba')
  limit 1;

  if product_jean_id is null then
    insert into products (restaurant_id, category_id, name, description, price, image_url, is_available, is_featured, track_stock, sort_order)
    values (demo_restaurant_id, category_denim_id, 'Jean Recto Alba', 'Jean recto para probar tallas numericas y estados de pedidos.', 159.90, '/imagendefault.jpeg', true, false, true, 30)
    returning id into product_jean_id;
  else
    update products
    set category_id = category_denim_id,
        description = 'Jean recto para probar tallas numericas y estados de pedidos.',
        price = 159.90,
        image_url = '/imagendefault.jpeg',
        is_available = true,
        is_featured = false,
        track_stock = true,
        sort_order = 30
    where id = product_jean_id;
  end if;

  insert into product_variants (restaurant_id, product_id, name, description, price_delta, sort_order, is_active)
  select demo_restaurant_id, product_jean_id, variant.name, variant.description, variant.price_delta, variant.sort_order, true
  from (
    values
      ('26', 'Talla 26.', 0::numeric, 10),
      ('28', 'Talla 28.', 0::numeric, 20),
      ('30', 'Talla 30.', 0::numeric, 30),
      ('32', 'Talla 32.', 0::numeric, 40)
  ) as variant(name, description, price_delta, sort_order)
  where not exists (
    select 1
    from product_variants
    where restaurant_id = demo_restaurant_id
      and product_id = product_jean_id
      and lower(name) = lower(variant.name)
  );

  select id into current_option_group_id
  from product_option_groups
  where restaurant_id = demo_restaurant_id
    and product_id = product_jean_id
    and lower(name) = lower('Lavado')
  limit 1;

  if current_option_group_id is null then
    insert into product_option_groups (restaurant_id, product_id, name, description, min_choices, max_choices, is_required, sort_order, is_active)
    values (demo_restaurant_id, product_jean_id, 'Lavado', 'Elige el acabado del denim.', 1, 1, true, 10, true)
    returning id into current_option_group_id;
  end if;

  insert into product_options (restaurant_id, product_id, option_group_id, name, description, price_delta, sort_order, is_active)
  select demo_restaurant_id, product_jean_id, current_option_group_id, option_row.name, option_row.description, option_row.price_delta, option_row.sort_order, true
  from (
    values
      ('Azul medio', 'Lavado diario.', 0::numeric, 10),
      ('Negro', 'Lavado oscuro.', 0::numeric, 20),
      ('Celeste vintage', 'Lavado mas claro.', 0::numeric, 30)
  ) as option_row(name, description, price_delta, sort_order)
  where not exists (
    select 1
    from product_options
    where restaurant_id = demo_restaurant_id
      and product_id = product_jean_id
      and option_group_id = current_option_group_id
      and lower(name) = lower(option_row.name)
  );

  select id
  into product_blouse_id
  from products
  where restaurant_id = demo_restaurant_id
    and lower(name) = lower('Blusa Lino Sol')
  limit 1;

  if product_blouse_id is null then
    insert into products (restaurant_id, category_id, name, description, price, image_url, is_available, is_featured, track_stock, sort_order)
    values (demo_restaurant_id, category_new_arrivals_id, 'Blusa Lino Sol', 'Blusa ligera para probar nuevos ingresos y variantes simples.', 119.90, '/imagendefault.jpeg', true, false, true, 40)
    returning id into product_blouse_id;
  else
    update products
    set category_id = category_new_arrivals_id,
        description = 'Blusa ligera para probar nuevos ingresos y variantes simples.',
        price = 119.90,
        image_url = '/imagendefault.jpeg',
        is_available = true,
        is_featured = false,
        track_stock = true,
        sort_order = 40
    where id = product_blouse_id;
  end if;

  insert into product_variants (restaurant_id, product_id, name, description, price_delta, sort_order, is_active)
  select demo_restaurant_id, product_blouse_id, variant.name, variant.description, variant.price_delta, variant.sort_order, true
  from (
    values
      ('S', 'Talla pequena.', 0::numeric, 10),
      ('M', 'Talla mediana.', 0::numeric, 20),
      ('L', 'Talla amplia.', 0::numeric, 30)
  ) as variant(name, description, price_delta, sort_order)
  where not exists (
    select 1
    from product_variants
    where restaurant_id = demo_restaurant_id
      and product_id = product_blouse_id
      and lower(name) = lower(variant.name)
  );

  select id into current_option_group_id
  from product_option_groups
  where restaurant_id = demo_restaurant_id
    and product_id = product_blouse_id
    and lower(name) = lower('Color')
  limit 1;

  if current_option_group_id is null then
    insert into product_option_groups (restaurant_id, product_id, name, description, min_choices, max_choices, is_required, sort_order, is_active)
    values (demo_restaurant_id, product_blouse_id, 'Color', 'Selecciona la variante de color.', 1, 1, true, 10, true)
    returning id into current_option_group_id;
  end if;

  insert into product_options (restaurant_id, product_id, option_group_id, name, description, price_delta, sort_order, is_active)
  select demo_restaurant_id, product_blouse_id, current_option_group_id, option_row.name, option_row.description, option_row.price_delta, option_row.sort_order, true
  from (
    values
      ('Marfil', 'Color claro.', 0::numeric, 10),
      ('Rosa palo', 'Tono suave.', 0::numeric, 20),
      ('Chocolate', 'Tono oscuro.', 0::numeric, 30)
  ) as option_row(name, description, price_delta, sort_order)
  where not exists (
    select 1
    from product_options
    where restaurant_id = demo_restaurant_id
      and product_id = product_blouse_id
      and option_group_id = current_option_group_id
      and lower(name) = lower(option_row.name)
  );

  select id
  into product_bag_id
  from products
  where restaurant_id = demo_restaurant_id
    and lower(name) = lower('Bolso Mini Nube')
  limit 1;

  if product_bag_id is null then
    insert into products (restaurant_id, category_id, name, description, price, image_url, is_available, is_featured, track_stock, sort_order)
    values (demo_restaurant_id, category_accessories_id, 'Bolso Mini Nube', 'Bolso compacto para probar accesorios y entrega sin cocina.', 99.90, '/imagendefault.jpeg', true, true, true, 50)
    returning id into product_bag_id;
  else
    update products
    set category_id = category_accessories_id,
        description = 'Bolso compacto para probar accesorios y entrega sin cocina.',
        price = 99.90,
        image_url = '/imagendefault.jpeg',
        is_available = true,
        is_featured = true,
        track_stock = true,
        sort_order = 50
    where id = product_bag_id;
  end if;

  insert into product_variants (restaurant_id, product_id, name, description, price_delta, sort_order, is_active)
  select demo_restaurant_id, product_bag_id, variant.name, variant.description, variant.price_delta, variant.sort_order, true
  from (
    values
      ('Unica', 'Modelo unico.', 0::numeric, 10)
  ) as variant(name, description, price_delta, sort_order)
  where not exists (
    select 1
    from product_variants
    where restaurant_id = demo_restaurant_id
      and product_id = product_bag_id
      and lower(name) = lower(variant.name)
  );

  select id into current_option_group_id
  from product_option_groups
  where restaurant_id = demo_restaurant_id
    and product_id = product_bag_id
    and lower(name) = lower('Color')
  limit 1;

  if current_option_group_id is null then
    insert into product_option_groups (restaurant_id, product_id, name, description, min_choices, max_choices, is_required, sort_order, is_active)
    values (demo_restaurant_id, product_bag_id, 'Color', 'Escoge el color del bolso.', 1, 1, true, 10, true)
    returning id into current_option_group_id;
  end if;

  insert into product_options (restaurant_id, product_id, option_group_id, name, description, price_delta, sort_order, is_active)
  select demo_restaurant_id, product_bag_id, current_option_group_id, option_row.name, option_row.description, option_row.price_delta, option_row.sort_order, true
  from (
    values
      ('Negro', 'Clasico.', 0::numeric, 10),
      ('Moka', 'Tono tierra.', 0::numeric, 20),
      ('Vino', 'Color profundo.', 0::numeric, 30)
  ) as option_row(name, description, price_delta, sort_order)
  where not exists (
    select 1
    from product_options
    where restaurant_id = demo_restaurant_id
      and product_id = product_bag_id
      and option_group_id = current_option_group_id
      and lower(name) = lower(option_row.name)
  );

  select id
  into inventory_dress_id
  from inventory_items
  where restaurant_id = demo_restaurant_id
    and sku = 'BRI-AUR-001'
  limit 1;

  if inventory_dress_id is null then
    insert into inventory_items (
      restaurant_id,
      name,
      unit,
      current_stock,
      min_stock,
      unit_cost,
      sku,
      category,
      category_id,
      purchase_unit,
      purchase_to_stock_factor,
      supplier_id,
      is_active
    )
    values (demo_restaurant_id, 'Vestido Aurora - stock general', 'u', 8, 2, 95, 'BRI-AUR-001', 'Prendas', inventory_category_garments_id, 'paquete', 1, demo_supplier_id, true)
    returning id into inventory_dress_id;
  else
    update inventory_items
    set name = 'Vestido Aurora - stock general',
        unit = 'u',
        current_stock = 8,
        min_stock = 2,
        unit_cost = 95,
        category = 'Prendas',
        category_id = inventory_category_garments_id,
        purchase_unit = 'paquete',
        purchase_to_stock_factor = 1,
        supplier_id = demo_supplier_id,
        is_active = true
    where id = inventory_dress_id;
  end if;

  select id
  into inventory_blazer_id
  from inventory_items
  where restaurant_id = demo_restaurant_id
    and sku = 'BRI-SIE-002'
  limit 1;

  if inventory_blazer_id is null then
    insert into inventory_items (
      restaurant_id,
      name,
      unit,
      current_stock,
      min_stock,
      unit_cost,
      sku,
      category,
      category_id,
      purchase_unit,
      purchase_to_stock_factor,
      supplier_id,
      is_active
    )
    values (demo_restaurant_id, 'Blazer Siena - stock general', 'u', 6, 2, 130, 'BRI-SIE-002', 'Prendas', inventory_category_garments_id, 'caja', 1, demo_supplier_id, true)
    returning id into inventory_blazer_id;
  else
    update inventory_items
    set name = 'Blazer Siena - stock general',
        unit = 'u',
        current_stock = 6,
        min_stock = 2,
        unit_cost = 130,
        category = 'Prendas',
        category_id = inventory_category_garments_id,
        purchase_unit = 'caja',
        purchase_to_stock_factor = 1,
        supplier_id = demo_supplier_id,
        is_active = true
    where id = inventory_blazer_id;
  end if;

  select id
  into inventory_jean_id
  from inventory_items
  where restaurant_id = demo_restaurant_id
    and sku = 'BRI-ALB-003'
  limit 1;

  if inventory_jean_id is null then
    insert into inventory_items (
      restaurant_id,
      name,
      unit,
      current_stock,
      min_stock,
      unit_cost,
      sku,
      category,
      category_id,
      purchase_unit,
      purchase_to_stock_factor,
      supplier_id,
      is_active
    )
    values (demo_restaurant_id, 'Jean Recto Alba - stock general', 'u', 10, 3, 78, 'BRI-ALB-003', 'Prendas', inventory_category_garments_id, 'lote', 1, demo_supplier_id, true)
    returning id into inventory_jean_id;
  else
    update inventory_items
    set name = 'Jean Recto Alba - stock general',
        unit = 'u',
        current_stock = 10,
        min_stock = 3,
        unit_cost = 78,
        category = 'Prendas',
        category_id = inventory_category_garments_id,
        purchase_unit = 'lote',
        purchase_to_stock_factor = 1,
        supplier_id = demo_supplier_id,
        is_active = true
    where id = inventory_jean_id;
  end if;

  select id
  into inventory_blouse_id
  from inventory_items
  where restaurant_id = demo_restaurant_id
    and sku = 'BRI-SOL-004'
  limit 1;

  if inventory_blouse_id is null then
    insert into inventory_items (
      restaurant_id,
      name,
      unit,
      current_stock,
      min_stock,
      unit_cost,
      sku,
      category,
      category_id,
      purchase_unit,
      purchase_to_stock_factor,
      supplier_id,
      is_active
    )
    values (demo_restaurant_id, 'Blusa Lino Sol - stock general', 'u', 12, 3, 58, 'BRI-SOL-004', 'Prendas', inventory_category_garments_id, 'lote', 1, demo_supplier_id, true)
    returning id into inventory_blouse_id;
  else
    update inventory_items
    set name = 'Blusa Lino Sol - stock general',
        unit = 'u',
        current_stock = 12,
        min_stock = 3,
        unit_cost = 58,
        category = 'Prendas',
        category_id = inventory_category_garments_id,
        purchase_unit = 'lote',
        purchase_to_stock_factor = 1,
        supplier_id = demo_supplier_id,
        is_active = true
    where id = inventory_blouse_id;
  end if;

  select id
  into inventory_bag_id
  from inventory_items
  where restaurant_id = demo_restaurant_id
    and sku = 'BRI-NUB-005'
  limit 1;

  if inventory_bag_id is null then
    insert into inventory_items (
      restaurant_id,
      name,
      unit,
      current_stock,
      min_stock,
      unit_cost,
      sku,
      category,
      category_id,
      purchase_unit,
      purchase_to_stock_factor,
      supplier_id,
      is_active
    )
    values (demo_restaurant_id, 'Bolso Mini Nube - stock general', 'u', 15, 4, 40, 'BRI-NUB-005', 'Accesorios', inventory_category_accessories_id, 'caja', 1, demo_supplier_id, true)
    returning id into inventory_bag_id;
  else
    update inventory_items
    set name = 'Bolso Mini Nube - stock general',
        unit = 'u',
        current_stock = 15,
        min_stock = 4,
        unit_cost = 40,
        category = 'Accesorios',
        category_id = inventory_category_accessories_id,
        purchase_unit = 'caja',
        purchase_to_stock_factor = 1,
        supplier_id = demo_supplier_id,
        is_active = true
    where id = inventory_bag_id;
  end if;

  insert into inventory_item_zones (restaurant_id, inventory_item_id, zone_id, stock)
  values
    (demo_restaurant_id, inventory_dress_id, demo_zone_id, 8),
    (demo_restaurant_id, inventory_blazer_id, demo_zone_id, 6),
    (demo_restaurant_id, inventory_jean_id, demo_zone_id, 10),
    (demo_restaurant_id, inventory_blouse_id, demo_zone_id, 12),
    (demo_restaurant_id, inventory_bag_id, demo_zone_id, 15)
  on conflict (inventory_item_id, zone_id) do update
    set stock = excluded.stock;

  insert into product_ingredients (restaurant_id, product_id, inventory_item_id, quantity, waste_factor, notes)
  values
    (demo_restaurant_id, product_dress_id, inventory_dress_id, 1, 0, 'Descuento general por unidad vendida.'),
    (demo_restaurant_id, product_blazer_id, inventory_blazer_id, 1, 0, 'Descuento general por unidad vendida.'),
    (demo_restaurant_id, product_jean_id, inventory_jean_id, 1, 0, 'Descuento general por unidad vendida.'),
    (demo_restaurant_id, product_blouse_id, inventory_blouse_id, 1, 0, 'Descuento general por unidad vendida.'),
    (demo_restaurant_id, product_bag_id, inventory_bag_id, 1, 0, 'Descuento general por unidad vendida.')
  on conflict (product_id, inventory_item_id) do update
    set quantity = excluded.quantity,
        waste_factor = excluded.waste_factor,
        notes = excluded.notes;
end $$;
