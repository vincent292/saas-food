do $$
declare
  restaurant_record record;
  category_alitas uuid;
  category_bebidas uuid;
  category_cafes uuid;
  category_infusiones uuid;
  category_combos uuid;
  product_alitas uuid;
  product_te uuid;
  product_cafe uuid;
  product_burger uuid;
  product_limonada uuid;
  group_id uuid;
begin
  for restaurant_record in select id from restaurants where status = 'active' loop
    select id into category_alitas from categories where restaurant_id = restaurant_record.id and lower(name) = lower('Alitas y combos') limit 1;
    if category_alitas is null then
      insert into categories (restaurant_id, name, description, image_url, sort_order, is_active)
      values (restaurant_record.id, 'Alitas y combos', 'Platos con tamanos, salsas y acompanamientos configurables.', '/imagendefault.jpeg', 10, true)
      returning id into category_alitas;
    end if;

    select id into category_bebidas from categories where restaurant_id = restaurant_record.id and lower(name) = lower('Bebidas frias') limit 1;
    if category_bebidas is null then
      insert into categories (restaurant_id, name, description, image_url, sort_order, is_active)
      values (restaurant_record.id, 'Bebidas frias', 'Bebidas naturales con tamanos y agregados.', '/imagendefault.jpeg', 20, true)
      returning id into category_bebidas;
    end if;

    select id into category_cafes from categories where restaurant_id = restaurant_record.id and lower(name) = lower('Cafes') limit 1;
    if category_cafes is null then
      insert into categories (restaurant_id, name, description, image_url, sort_order, is_active)
      values (restaurant_record.id, 'Cafes', 'Cafe caliente, frio y extras.', '/imagendefault.jpeg', 30, true)
      returning id into category_cafes;
    end if;

    select id into category_infusiones from categories where restaurant_id = restaurant_record.id and lower(name) = lower('Infusiones') limit 1;
    if category_infusiones is null then
      insert into categories (restaurant_id, name, description, image_url, sort_order, is_active)
      values (restaurant_record.id, 'Infusiones', 'Tes e infusiones con endulzantes y presentaciones.', '/imagendefault.jpeg', 40, true)
      returning id into category_infusiones;
    end if;

    select id into category_combos from categories where restaurant_id = restaurant_record.id and lower(name) = lower('Combos') limit 1;
    if category_combos is null then
      insert into categories (restaurant_id, name, description, image_url, sort_order, is_active)
      values (restaurant_record.id, 'Combos', 'Combos armables para mesa.', '/imagendefault.jpeg', 50, true)
      returning id into category_combos;
    end if;

    select id into product_alitas from products where restaurant_id = restaurant_record.id and lower(name) = lower('Alitas clasicas') limit 1;
    if product_alitas is null then
      insert into products (restaurant_id, category_id, name, description, price, image_url, is_available, is_featured, sort_order)
      values (restaurant_record.id, category_alitas, 'Alitas clasicas', 'Alitas banadas o con salsa aparte. Elige piezas y agregados.', 30, '/imagendefault.jpeg', true, true, 10)
      returning id into product_alitas;
    end if;

    insert into product_variants (restaurant_id, product_id, name, description, price_delta, sort_order, is_active)
    select restaurant_record.id, product_alitas, variant.name, variant.description, variant.price_delta, variant.sort_order, true
    from (values
      ('6 piezas', 'Porcion personal.', 0::numeric, 10),
      ('12 piezas', 'Porcion para compartir.', 28::numeric, 20),
      ('24 piezas', 'Combo grande para mesa.', 82::numeric, 30)
    ) as variant(name, description, price_delta, sort_order)
    where not exists (
      select 1 from product_variants where restaurant_id = restaurant_record.id and product_id = product_alitas and lower(name) = lower(variant.name)
    );

    select id into group_id from product_option_groups where restaurant_id = restaurant_record.id and product_id = product_alitas and lower(name) = lower('Salsa') limit 1;
    if group_id is null then
      insert into product_option_groups (restaurant_id, product_id, name, description, min_choices, max_choices, is_required, sort_order, is_active)
      values (restaurant_record.id, product_alitas, 'Salsa', 'Elige como quieres tus alitas.', 1, 2, true, 10, true)
      returning id into group_id;
    end if;
    insert into product_options (restaurant_id, product_id, option_group_id, name, description, price_delta, sort_order, is_active)
    select restaurant_record.id, product_alitas, group_id, option.name, option.description, option.price_delta, option.sort_order, true
    from (values
      ('BBQ', 'Dulce ahumada.', 0::numeric, 10),
      ('Buffalo', 'Picante clasica.', 0::numeric, 20),
      ('Miel mostaza', 'Dulce y cremosa.', 0::numeric, 30),
      ('Salsa aparte', 'Salsas servidas por separado.', 0::numeric, 40)
    ) as option(name, description, price_delta, sort_order)
    where not exists (
      select 1 from product_options where restaurant_id = restaurant_record.id and product_id = product_alitas and option_group_id = group_id and lower(name) = lower(option.name)
    );

    select id into group_id from product_option_groups where restaurant_id = restaurant_record.id and product_id = product_alitas and lower(name) = lower('Agregados') limit 1;
    if group_id is null then
      insert into product_option_groups (restaurant_id, product_id, name, description, min_choices, max_choices, is_required, sort_order, is_active)
      values (restaurant_record.id, product_alitas, 'Agregados', 'Suma acompanamientos al pedido.', 0, 3, false, 20, true)
      returning id into group_id;
    end if;
    insert into product_options (restaurant_id, product_id, option_group_id, name, description, price_delta, sort_order, is_active)
    select restaurant_record.id, product_alitas, group_id, option.name, option.description, option.price_delta, option.sort_order, true
    from (values
      ('Papas fritas', 'Porcion individual.', 6::numeric, 10),
      ('Papas grandes', 'Porcion para compartir.', 12::numeric, 20),
      ('Bebida 500 ml', 'Gaseosa o agua.', 7::numeric, 30)
    ) as option(name, description, price_delta, sort_order)
    where not exists (
      select 1 from product_options where restaurant_id = restaurant_record.id and product_id = product_alitas and option_group_id = group_id and lower(name) = lower(option.name)
    );

    select id into product_te from products where restaurant_id = restaurant_record.id and lower(name) = lower('Te de manzanilla') limit 1;
    if product_te is null then
      insert into products (restaurant_id, category_id, name, description, price, image_url, is_available, is_featured, sort_order)
      values (restaurant_record.id, category_infusiones, 'Te de manzanilla', 'Infusion suave de manzanilla con opciones de endulzante.', 8, '/imagendefault.jpeg', true, false, 20)
      returning id into product_te;
    end if;

    insert into product_variants (restaurant_id, product_id, name, description, price_delta, sort_order, is_active)
    select restaurant_record.id, product_te, variant.name, variant.description, variant.price_delta, variant.sort_order, true
    from (values
      ('Taza caliente', 'Presentacion clasica.', 0::numeric, 10),
      ('Jarra para mesa', 'Rinde 3 a 4 tazas.', 14::numeric, 20),
      ('Frio con hielo', 'Infusion fria.', 2::numeric, 30)
    ) as variant(name, description, price_delta, sort_order)
    where not exists (
      select 1 from product_variants where restaurant_id = restaurant_record.id and product_id = product_te and lower(name) = lower(variant.name)
    );

    select id into group_id from product_option_groups where restaurant_id = restaurant_record.id and product_id = product_te and lower(name) = lower('Endulzante') limit 1;
    if group_id is null then
      insert into product_option_groups (restaurant_id, product_id, name, description, min_choices, max_choices, is_required, sort_order, is_active)
      values (restaurant_record.id, product_te, 'Endulzante', 'Personaliza tu infusion.', 0, 2, false, 10, true)
      returning id into group_id;
    end if;
    insert into product_options (restaurant_id, product_id, option_group_id, name, description, price_delta, sort_order, is_active)
    select restaurant_record.id, product_te, group_id, option.name, option.description, option.price_delta, option.sort_order, true
    from (values
      ('Miel', 'Porcion de miel.', 2::numeric, 10),
      ('Limon', 'Rodaja de limon.', 1::numeric, 20),
      ('Sin azucar', 'Sin endulzante.', 0::numeric, 30)
    ) as option(name, description, price_delta, sort_order)
    where not exists (
      select 1 from product_options where restaurant_id = restaurant_record.id and product_id = product_te and option_group_id = group_id and lower(name) = lower(option.name)
    );

    select id into product_cafe from products where restaurant_id = restaurant_record.id and lower(name) = lower('Cafe americano') limit 1;
    if product_cafe is null then
      insert into products (restaurant_id, category_id, name, description, price, image_url, is_available, is_featured, sort_order)
      values (restaurant_record.id, category_cafes, 'Cafe americano', 'Cafe negro con tamanos y extras.', 10, '/imagendefault.jpeg', true, true, 30)
      returning id into product_cafe;
    end if;

    insert into product_variants (restaurant_id, product_id, name, description, price_delta, sort_order, is_active)
    select restaurant_record.id, product_cafe, variant.name, variant.description, variant.price_delta, variant.sort_order, true
    from (values
      ('Normal', '8 oz.', 0::numeric, 10),
      ('Grande', '12 oz.', 4::numeric, 20),
      ('Helado', 'Con hielo.', 5::numeric, 30)
    ) as variant(name, description, price_delta, sort_order)
    where not exists (
      select 1 from product_variants where restaurant_id = restaurant_record.id and product_id = product_cafe and lower(name) = lower(variant.name)
    );

    select id into group_id from product_option_groups where restaurant_id = restaurant_record.id and product_id = product_cafe and lower(name) = lower('Extras') limit 1;
    if group_id is null then
      insert into product_option_groups (restaurant_id, product_id, name, description, min_choices, max_choices, is_required, sort_order, is_active)
      values (restaurant_record.id, product_cafe, 'Extras', 'Agregados para el cafe.', 0, 3, false, 10, true)
      returning id into group_id;
    end if;
    insert into product_options (restaurant_id, product_id, option_group_id, name, description, price_delta, sort_order, is_active)
    select restaurant_record.id, product_cafe, group_id, option.name, option.description, option.price_delta, option.sort_order, true
    from (values
      ('Leche', 'Un toque de leche.', 2::numeric, 10),
      ('Shot extra', 'Mas cafe.', 5::numeric, 20),
      ('Vainilla', 'Sabor vainilla.', 3::numeric, 30)
    ) as option(name, description, price_delta, sort_order)
    where not exists (
      select 1 from product_options where restaurant_id = restaurant_record.id and product_id = product_cafe and option_group_id = group_id and lower(name) = lower(option.name)
    );

    select id into product_burger from products where restaurant_id = restaurant_record.id and lower(name) = lower('Burger smash') limit 1;
    if product_burger is null then
      insert into products (restaurant_id, category_id, name, description, price, image_url, is_available, is_featured, sort_order)
      values (restaurant_record.id, category_combos, 'Burger smash', 'Hamburguesa armable con papas y bebida opcional.', 28, '/imagendefault.jpeg', true, true, 40)
      returning id into product_burger;
    end if;

    insert into product_variants (restaurant_id, product_id, name, description, price_delta, sort_order, is_active)
    select restaurant_record.id, product_burger, variant.name, variant.description, variant.price_delta, variant.sort_order, true
    from (values
      ('Simple', 'Una carne.', 0::numeric, 10),
      ('Doble carne', 'Dos carnes.', 10::numeric, 20),
      ('Combo completo', 'Incluye papas y bebida.', 16::numeric, 30)
    ) as variant(name, description, price_delta, sort_order)
    where not exists (
      select 1 from product_variants where restaurant_id = restaurant_record.id and product_id = product_burger and lower(name) = lower(variant.name)
    );

    select id into group_id from product_option_groups where restaurant_id = restaurant_record.id and product_id = product_burger and lower(name) = lower('Extras burger') limit 1;
    if group_id is null then
      insert into product_option_groups (restaurant_id, product_id, name, description, min_choices, max_choices, is_required, sort_order, is_active)
      values (restaurant_record.id, product_burger, 'Extras burger', 'Arma tu hamburguesa.', 0, 4, false, 10, true)
      returning id into group_id;
    end if;
    insert into product_options (restaurant_id, product_id, option_group_id, name, description, price_delta, sort_order, is_active)
    select restaurant_record.id, product_burger, group_id, option.name, option.description, option.price_delta, option.sort_order, true
    from (values
      ('Queso cheddar', 'Lamina extra.', 4::numeric, 10),
      ('Tocino', 'Tocino crocante.', 7::numeric, 20),
      ('Papas', 'Porcion individual.', 6::numeric, 30),
      ('Bebida', 'Bebida 500 ml.', 7::numeric, 40)
    ) as option(name, description, price_delta, sort_order)
    where not exists (
      select 1 from product_options where restaurant_id = restaurant_record.id and product_id = product_burger and option_group_id = group_id and lower(name) = lower(option.name)
    );

    select id into product_limonada from products where restaurant_id = restaurant_record.id and lower(name) = lower('Limonada natural') limit 1;
    if product_limonada is null then
      insert into products (restaurant_id, category_id, name, description, price, image_url, is_available, is_featured, sort_order)
      values (restaurant_record.id, category_bebidas, 'Limonada natural', 'Bebida fresca con tamanos y sabores.', 9, '/imagendefault.jpeg', true, false, 50)
      returning id into product_limonada;
    end if;

    insert into product_variants (restaurant_id, product_id, name, description, price_delta, sort_order, is_active)
    select restaurant_record.id, product_limonada, variant.name, variant.description, variant.price_delta, variant.sort_order, true
    from (values
      ('Vaso 350 ml', 'Vaso individual.', 0::numeric, 10),
      ('Vaso 500 ml', 'Vaso grande.', 4::numeric, 20),
      ('Jarra 1 litro', 'Para compartir.', 15::numeric, 30)
    ) as variant(name, description, price_delta, sort_order)
    where not exists (
      select 1 from product_variants where restaurant_id = restaurant_record.id and product_id = product_limonada and lower(name) = lower(variant.name)
    );

    select id into group_id from product_option_groups where restaurant_id = restaurant_record.id and product_id = product_limonada and lower(name) = lower('Sabor') limit 1;
    if group_id is null then
      insert into product_option_groups (restaurant_id, product_id, name, description, min_choices, max_choices, is_required, sort_order, is_active)
      values (restaurant_record.id, product_limonada, 'Sabor', 'Elige el sabor principal.', 1, 1, true, 10, true)
      returning id into group_id;
    end if;
    insert into product_options (restaurant_id, product_id, option_group_id, name, description, price_delta, sort_order, is_active)
    select restaurant_record.id, product_limonada, group_id, option.name, option.description, option.price_delta, option.sort_order, true
    from (values
      ('Clasica', 'Limon natural.', 0::numeric, 10),
      ('Hierbabuena', 'Con hierbabuena.', 2::numeric, 20),
      ('Frutos rojos', 'Con frutos rojos.', 5::numeric, 30)
    ) as option(name, description, price_delta, sort_order)
    where not exists (
      select 1 from product_options where restaurant_id = restaurant_record.id and product_id = product_limonada and option_group_id = group_id and lower(name) = lower(option.name)
    );
  end loop;
end $$;
