import { createClient } from "@supabase/supabase-js";

const restaurantId = "a9b24a2e-17ba-4f94-a3e1-30b7778324fd";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
}

const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
const stats = { categoriesCreated: 0, productsCreated: 0, productsUpdated: 0, variantsCreated: 0, groupsCreated: 0, optionsCreated: 0 };

async function rows(table, columns, filters) {
  let query = supabase.from(table).select(columns);
  for (const [column, value] of Object.entries(filters)) query = query.eq(column, value);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

async function ensureCategory(category, sortOrder) {
  const existing = (await rows("categories", "id", { restaurant_id: restaurantId, name: category.name }))[0];
  if (existing) return existing.id;

  const { data, error } = await supabase
    .from("categories")
    .insert({ restaurant_id: restaurantId, name: category.name, description: category.description, sort_order: sortOrder, is_active: true })
    .select("id")
    .single();
  if (error) throw error;
  stats.categoriesCreated += 1;
  return data.id;
}

async function ensureProduct(categoryId, product, sortOrder) {
  const existing = (await rows("products", "id", { restaurant_id: restaurantId, name: product.name }))[0];
  const values = {
    category_id: categoryId,
    description: product.description,
    price: product.price,
    prep_minutes: product.prepMinutes ?? 10,
    is_available: true,
    is_featured: product.featured ?? false,
    product_kind: "standard",
    sort_order: sortOrder,
  };

  if (existing) {
    const { error } = await supabase.from("products").update(values).eq("id", existing.id).eq("restaurant_id", restaurantId);
    if (error) throw error;
    stats.productsUpdated += 1;
    return existing.id;
  }

  const { data, error } = await supabase
    .from("products")
    .insert({ restaurant_id: restaurantId, name: product.name, ...values })
    .select("id")
    .single();
  if (error) throw error;
  stats.productsCreated += 1;
  return data.id;
}

async function ensureVariants(productId, variants) {
  const existing = await rows("product_variants", "name", { restaurant_id: restaurantId, product_id: productId });
  const names = new Set(existing.map((item) => item.name.toLocaleLowerCase("es")));
  const missing = variants.filter((variant) => !names.has(variant.name.toLocaleLowerCase("es")));
  if (!missing.length) return;

  const { error } = await supabase.from("product_variants").insert(
    missing.map((variant, index) => ({
      restaurant_id: restaurantId,
      product_id: productId,
      name: variant.name,
      description: variant.description ?? null,
      price_delta: variant.priceDelta,
      sort_order: (index + 1) * 10,
      is_active: true,
    })),
  );
  if (error) throw error;
  stats.variantsCreated += missing.length;
}

async function ensureOptionGroup(productId, group, sortOrder) {
  const existing = (await rows("product_option_groups", "id", {
    restaurant_id: restaurantId,
    product_id: productId,
    name: group.name,
  }))[0];
  let groupId = existing?.id;

  if (!groupId) {
    const { data, error } = await supabase
      .from("product_option_groups")
      .insert({
        restaurant_id: restaurantId,
        product_id: productId,
        name: group.name,
        description: group.description ?? null,
        min_choices: group.required ? 1 : 0,
        max_choices: group.maxChoices ?? 1,
        is_required: group.required ?? false,
        sort_order: sortOrder,
        is_active: true,
      })
      .select("id")
      .single();
    if (error) throw error;
    groupId = data.id;
    stats.groupsCreated += 1;
  }

  const existingOptions = await rows("product_options", "name", { restaurant_id: restaurantId, option_group_id: groupId });
  const names = new Set(existingOptions.map((item) => item.name.toLocaleLowerCase("es")));
  const missing = group.options.filter((option) => !names.has(option.name.toLocaleLowerCase("es")));
  if (!missing.length) return;

  const { error } = await supabase.from("product_options").insert(
    missing.map((option, index) => ({
      restaurant_id: restaurantId,
      product_id: productId,
      option_group_id: groupId,
      name: option.name,
      description: option.description ?? null,
      price_delta: option.priceDelta,
      sort_order: (index + 1) * 10,
      is_active: true,
    })),
  );
  if (error) throw error;
  stats.optionsCreated += missing.length;
}

const catalog = [
  {
    name: "Refrescos",
    description: "Bebidas frías y gaseosas.",
    products: [
      { name: "Coca-Cola", description: "Gaseosa Coca-Cola bien fría.", price: 8, variants: [["Personal 500 ml", 0], ["1 litro", 7], ["2 litros", 14]], groups: [{ name: "Servicio", maxChoices: 2, options: [["Vaso con hielo", 1], ["Rodaja de limón", 1]] }] },
      { name: "Sprite", description: "Gaseosa sabor lima-limón.", price: 8, variants: [["Personal 500 ml", 0], ["1 litro", 7], ["2 litros", 14]], groups: [{ name: "Servicio", maxChoices: 2, options: [["Vaso con hielo", 1], ["Rodaja de limón", 1]] }] },
      { name: "Fanta Naranja", description: "Gaseosa sabor naranja.", price: 8, variants: [["Personal 500 ml", 0], ["1 litro", 7], ["2 litros", 14]], groups: [{ name: "Servicio", maxChoices: 2, options: [["Vaso con hielo", 1], ["Rodaja de naranja", 1]] }] },
      { name: "Agua saborizada", description: "Agua refrescante preparada al momento.", price: 7, variants: [["500 ml", 0], ["1 litro", 6]], groups: [{ name: "Sabor", required: true, options: [["Limón", 0], ["Frutilla", 1], ["Maracuyá", 2]] }] },
    ],
  },
  {
    name: "Cafés",
    description: "Cafés calientes y fríos.",
    products: [
      { name: "Café americano", description: "Café espresso alargado con agua caliente.", price: 10, featured: true, variants: [["Pequeño", 0], ["Mediano", 4], ["Grande", 7], ["Helado", 6]], groups: [{ name: "Extras", maxChoices: 3, options: [["Shot extra", 5], ["Leche", 2], ["Vainilla", 3]] }] },
      { name: "Cappuccino", description: "Espresso con leche vaporizada y espuma.", price: 15, variants: [["Pequeño", 0], ["Mediano", 4], ["Grande", 7]], groups: [{ name: "Tipo de leche", required: true, options: [["Leche entera", 0], ["Leche deslactosada", 3], ["Leche vegetal", 5]] }, { name: "Extras", maxChoices: 2, options: [["Canela", 0], ["Chocolate", 2], ["Shot extra", 5]] }] },
      { name: "Latte", description: "Espresso suave con abundante leche.", price: 16, variants: [["Mediano", 0], ["Grande", 5], ["Helado", 4]], groups: [{ name: "Sabor", maxChoices: 1, options: [["Vainilla", 3], ["Caramelo", 3], ["Avellana", 4]] }] },
    ],
  },
  {
    name: "Comidas",
    description: "Platos preparados para probar pedidos configurables.",
    products: [
      { name: "Hamburguesa clásica", description: "Carne, queso, lechuga, tomate y salsa de la casa.", price: 28, prepMinutes: 18, featured: true, variants: [["Simple", 0], ["Doble", 10], ["Triple", 18]], groups: [{ name: "Extras", maxChoices: 3, options: [["Queso extra", 4], ["Tocino", 6], ["Huevo", 4]] }, { name: "Sin ingredientes", maxChoices: 3, options: [["Sin cebolla", 0], ["Sin tomate", 0], ["Sin salsa", 0]] }] },
      { name: "Alitas de pollo", description: "Alitas crocantes con salsa a elección.", price: 30, prepMinutes: 20, variants: [["6 unidades", 0], ["12 unidades", 24], ["18 unidades", 44]], groups: [{ name: "Salsa", required: true, options: [["BBQ", 0], ["Picante", 0], ["Miel mostaza", 2]] }, { name: "Acompañamiento", maxChoices: 2, options: [["Papas fritas", 8], ["Aros de cebolla", 10]] }] },
      { name: "Salchipapa", description: "Papas fritas con salchicha y salsas.", price: 20, prepMinutes: 15, variants: [["Personal", 0], ["Mediana", 9], ["Familiar", 20]], groups: [{ name: "Salsas", maxChoices: 3, options: [["Kétchup", 0], ["Mayonesa", 0], ["Mostaza", 0], ["Salsa picante", 1]] }] },
    ],
  },
];

const { data: restaurant, error: restaurantError } = await supabase
  .from("restaurants")
  .select("id,name,slug")
  .eq("id", restaurantId)
  .is("deleted_at", null)
  .single();
if (restaurantError) throw restaurantError;

for (const [categoryIndex, category] of catalog.entries()) {
  const categoryId = await ensureCategory(category, (categoryIndex + 1) * 10);
  for (const [productIndex, product] of category.products.entries()) {
    const productId = await ensureProduct(categoryId, product, (productIndex + 1) * 10);
    await ensureVariants(productId, product.variants.map(([name, priceDelta]) => ({ name, priceDelta })));
    for (const [groupIndex, group] of (product.groups ?? []).entries()) {
      await ensureOptionGroup(productId, {
        ...group,
        options: group.options.map(([name, priceDelta]) => ({ name, priceDelta })),
      }, (groupIndex + 1) * 10);
    }
  }
}

console.log(JSON.stringify({ restaurant, ...stats }, null, 2));
