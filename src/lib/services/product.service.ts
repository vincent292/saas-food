import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { perfLog, perfNow } from "@/lib/utils/perf";
import type { Product, ProductOption, ProductOptionGroup, ProductStockAvailability, ProductVariant } from "@/types/product.types";
import type { Restaurant } from "@/types/restaurant.types";

function mapProduct(row: {
  id: string;
  restaurant_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price: number;
  compare_at_price?: number | null;
  prep_minutes?: number | null;
  image_url: string | null;
  image_position_x?: number | null;
  image_position_y?: number | null;
  image_zoom?: number | null;
  is_available: boolean;
  is_featured: boolean;
  product_kind?: "standard" | "promotion" | "lunch" | null;
  available_from?: string | null;
  available_until?: string | null;
  available_days?: number[] | null;
  available_start_time?: string | null;
  available_end_time?: string | null;
  order_count?: number | null;
  last_ordered_at?: string | null;
  track_stock: boolean;
  sort_order: number;
}, isAutoFeatured = false): Product {
  const productKind = row.product_kind ?? "standard";

  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    categoryId: row.category_id ?? "",
    name: row.name,
    description: row.description ?? "",
    price: Number(row.price),
    compareAtPrice: row.compare_at_price != null ? Number(row.compare_at_price) : undefined,
    prepMinutes: Number(row.prep_minutes ?? 15),
    imageUrl: row.image_url ?? "",
    imagePositionX: Number(row.image_position_x ?? 50),
    imagePositionY: Number(row.image_position_y ?? 50),
    imageZoom: Number(row.image_zoom ?? 1),
    isAvailable: row.is_available,
    isFeatured: row.is_featured,
    isAutoFeatured,
    trackStock: row.track_stock,
    productKind,
    availableFrom: row.available_from ?? undefined,
    availableUntil: row.available_until ?? undefined,
    availableDays: row.available_days ?? undefined,
    availableStartTime: row.available_start_time ?? undefined,
    availableEndTime: row.available_end_time ?? undefined,
    isPromotion: productKind === "promotion",
    orderCount: Number(row.order_count ?? 0),
    lastOrderedAt: row.last_ordered_at ?? undefined,
    sortOrder: row.sort_order,
  };
}

function boliviaScheduleParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/La_Paz",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "Sun";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  const weekdayIndex: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return { dayOfWeek: weekdayIndex[weekday] ?? 0, minutes: hour * 60 + minute };
}

function timeToMinutes(value?: string) {
  if (!value) return null;
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function isWithinProductSchedule({
  availableDays,
  end,
  minutes,
  dayOfWeek,
  start,
}: {
  availableDays?: number[] | null;
  dayOfWeek: number;
  end: number | null;
  minutes: number;
  start: number | null;
}) {
  const hasDayRestriction = Boolean(availableDays?.length);
  const currentDayAllowed = !hasDayRestriction || Boolean(availableDays?.includes(dayOfWeek));
  const previousDayAllowed = !hasDayRestriction || Boolean(availableDays?.includes((dayOfWeek + 6) % 7));

  if (start == null && end == null) {
    return currentDayAllowed;
  }

  if (start != null && end != null && start > end) {
    return (currentDayAllowed && minutes >= start) || (previousDayAllowed && minutes <= end);
  }

  if (start != null && end != null) {
    return currentDayAllowed && minutes >= start && minutes <= end;
  }

  if (start != null) {
    return currentDayAllowed && minutes >= start;
  }

  return currentDayAllowed && end != null && minutes <= end;
}

function isProductCurrentlyOrderable(product: Product, date = new Date()) {
  if (!product.isAvailable) {
    return false;
  }

  const nowTime = date.getTime();
  if (product.availableFrom && new Date(product.availableFrom).getTime() > nowTime) {
    return false;
  }

  if (product.availableUntil && new Date(product.availableUntil).getTime() < nowTime) {
    return false;
  }

  const start = timeToMinutes(product.availableStartTime);
  const end = timeToMinutes(product.availableEndTime);
  const { dayOfWeek, minutes } = boliviaScheduleParts(date);
  return isWithinProductSchedule({ availableDays: product.availableDays, dayOfWeek, end, minutes, start });
}

function normalizeProductName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function mapVariant(row: {
  id: string;
  restaurant_id: string;
  product_id: string;
  name: string;
  description: string | null;
  price_delta: number;
  sort_order: number;
  is_active: boolean;
}): ProductVariant {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    productId: row.product_id,
    name: row.name,
    description: row.description ?? "",
    priceDelta: Number(row.price_delta),
    sortOrder: row.sort_order,
    isActive: row.is_active,
  };
}

function mapOption(row: {
  id: string;
  restaurant_id: string;
  product_id: string;
  option_group_id: string;
  name: string;
  description: string | null;
  price_delta: number;
  inventory_item_id?: string | null;
  inventory_quantity?: number | null;
  inventory_waste_factor?: number | null;
  sort_order: number;
  is_active: boolean;
}): ProductOption {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    productId: row.product_id,
    optionGroupId: row.option_group_id,
    name: row.name,
    description: row.description ?? "",
    priceDelta: Number(row.price_delta),
    inventoryItemId: row.inventory_item_id ?? undefined,
    inventoryQuantity: row.inventory_quantity != null ? Number(row.inventory_quantity) : undefined,
    inventoryWasteFactor: Number(row.inventory_waste_factor ?? 0),
    sortOrder: row.sort_order,
    isActive: row.is_active,
  };
}

function mapOptionGroup(
  row: {
    id: string;
    restaurant_id: string;
    product_id: string;
    name: string;
    description: string | null;
    min_choices: number;
    max_choices: number;
    is_required: boolean;
    sort_order: number;
    is_active: boolean;
  },
  options: ProductOption[],
): ProductOptionGroup {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    productId: row.product_id,
    name: row.name,
    description: row.description ?? "",
    minChoices: row.min_choices,
    maxChoices: row.max_choices,
    isRequired: row.is_required,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    options,
  };
}

export const productService = {
  async listByRestaurant(restaurantId: string) {
    if (!hasSupabaseEnv()) {
      return [];
    }

    const totalStartedAt = perfNow();
    const supabase = await createClient();
    const queryStartedAt = perfNow();
    const { data, error } = await supabase
      .from("products")
      .select("id,restaurant_id,category_id,name,description,price,compare_at_price,prep_minutes,image_url,image_position_x,image_position_y,image_zoom,is_available,is_featured,product_kind,available_from,available_until,available_days,available_start_time,available_end_time,order_count,last_ordered_at,track_stock,sort_order")
      .eq("restaurant_id", restaurantId)
      .order("sort_order");
    perfLog("[productService.listByRestaurant] query", queryStartedAt, { restaurantId, rows: data?.length ?? 0, error: Boolean(error) });

    if (error || !data?.length) {
      perfLog("[productService.listByRestaurant] total", totalStartedAt, { restaurantId, rows: 0 });
      return [];
    }

    const mostOrderedIds = new Set(
      [...data]
        .filter((product) => Number(product.order_count ?? 0) > 0)
        .sort((first, second) => Number(second.order_count ?? 0) - Number(first.order_count ?? 0))
        .slice(0, 3)
        .map((product) => product.id),
    );

    const products = data.map((product) => mapProduct(product, mostOrderedIds.has(product.id)));
    perfLog("[productService.listByRestaurant] total", totalStartedAt, { restaurantId, rows: products.length });
    return products;
  },

  async listAvailableByRestaurant(restaurantId: string) {
    const totalStartedAt = perfNow();
    const products = (await this.listByRestaurant(restaurantId)).filter((product) => isProductCurrentlyOrderable(product));
    perfLog("[productService.listAvailableByRestaurant] total", totalStartedAt, { restaurantId, rows: products.length });
    return products;
  },

  async listPublicAvailableByRestaurant(restaurantId: string) {
    if (!hasSupabaseEnv()) {
      return [];
    }

    const supabase = createPublicServerClient();
    if (!supabase) {
      return [];
    }

    const { data, error } = await supabase
      .from("products")
      .select("id,restaurant_id,category_id,name,description,price,compare_at_price,prep_minutes,image_url,image_position_x,image_position_y,image_zoom,is_available,is_featured,product_kind,available_from,available_until,available_days,available_start_time,available_end_time,order_count,last_ordered_at,track_stock,sort_order")
      .eq("restaurant_id", restaurantId)
      .eq("is_available", true)
      .order("sort_order");

    if (error || !data?.length) {
      return [];
    }

    const mostOrderedIds = new Set(
      [...data]
        .filter((product) => Number(product.order_count ?? 0) > 0)
        .sort((first, second) => Number(second.order_count ?? 0) - Number(first.order_count ?? 0))
        .slice(0, 3)
        .map((product) => product.id),
    );

    return data.map((product) => mapProduct(product, mostOrderedIds.has(product.id))).filter((product) => isProductCurrentlyOrderable(product));
  },

  async listPublicStockAvailability(restaurant: Restaurant, products: Product[]): Promise<ProductStockAvailability[]> {
    if (!hasSupabaseEnv() || !products.length) {
      return [];
    }

    const admin = createAdminClient();
    if (!admin) {
      return products.map((product) => ({ productId: product.id, isAvailableHere: true, alternatives: [] }));
    }

    const productIds = products.map((product) => product.id);
    const { data: ingredients } = await admin
      .from("product_ingredients")
      .select("restaurant_id,product_id,inventory_item_id,quantity,waste_factor")
      .eq("restaurant_id", restaurant.id)
      .in("product_id", productIds);
    const itemIds = Array.from(new Set((ingredients ?? []).map((ingredient) => ingredient.inventory_item_id)));
    const { data: items } = itemIds.length
      ? await admin.from("inventory_items").select("id,current_stock,is_active").in("id", itemIds)
      : { data: [] };

    const itemsById = new Map((items ?? []).map((item) => [item.id, { currentStock: Number(item.current_stock), isActive: item.is_active }]));
    const ingredientsByProduct = new Map<string, typeof ingredients>();
    for (const ingredient of ingredients ?? []) {
      const list = ingredientsByProduct.get(ingredient.product_id) ?? [];
      list.push(ingredient);
      ingredientsByProduct.set(ingredient.product_id, list);
    }

    function hasStockFor(productId: string, ingredientList = ingredientsByProduct.get(productId) ?? []) {
      if (!ingredientList.length) {
        return true;
      }
      return ingredientList.every((ingredient) => {
        const item = itemsById.get(ingredient.inventory_item_id);
        const required = Number(ingredient.quantity) * (1 + Number(ingredient.waste_factor ?? 0) / 100);
        return item ? item.isActive && item.currentStock >= required : false;
      });
    }

    const baseAvailability = products.map((product) => ({
      productId: product.id,
      isAvailableHere: hasStockFor(product.id),
      alternatives: [],
    })) satisfies ProductStockAvailability[];
    const unavailableProducts = products.filter((product) => !baseAvailability.find((item) => item.productId === product.id)?.isAvailableHere);

    if (!unavailableProducts.length || !restaurant.city || (!restaurant.ownerUserId && !restaurant.ownerEmail)) {
      return baseAvailability;
    }

    let branchQuery = admin
      .from("restaurants")
      .select("id,name,slug,city,address,owner_user_id,owner_email,status,deleted_at")
      .neq("id", restaurant.id)
      .eq("status", "active")
      .is("deleted_at", null)
      .eq("city", restaurant.city);

    branchQuery = restaurant.ownerUserId ? branchQuery.eq("owner_user_id", restaurant.ownerUserId) : branchQuery.eq("owner_email", restaurant.ownerEmail ?? "");

    const { data: branches } = await branchQuery;
    if (!branches?.length) {
      return baseAvailability;
    }

    const branchIds = branches.map((branch) => branch.id);
    const { data: branchProducts } = await admin
      .from("products")
      .select("id,restaurant_id,name,is_available")
      .in("restaurant_id", branchIds)
      .eq("is_available", true);
    const branchProductIds = (branchProducts ?? []).map((product) => product.id);
    const { data: branchIngredients } = branchProductIds.length
      ? await admin.from("product_ingredients").select("restaurant_id,product_id,inventory_item_id,quantity,waste_factor").in("product_id", branchProductIds)
      : { data: [] };
    const branchItemIds = Array.from(new Set((branchIngredients ?? []).map((ingredient) => ingredient.inventory_item_id)));
    const { data: branchItems } = branchItemIds.length
      ? await admin.from("inventory_items").select("id,current_stock,is_active").in("id", branchItemIds)
      : { data: [] };

    const branchItemsById = new Map((branchItems ?? []).map((item) => [item.id, { currentStock: Number(item.current_stock), isActive: item.is_active }]));
    const branchIngredientsByProduct = new Map<string, typeof branchIngredients>();
    for (const ingredient of branchIngredients ?? []) {
      const list = branchIngredientsByProduct.get(ingredient.product_id) ?? [];
      list.push(ingredient);
      branchIngredientsByProduct.set(ingredient.product_id, list);
    }
    const branchesById = new Map(branches.map((branch) => [branch.id, branch]));

    function branchHasStock(productId: string) {
      const ingredientList = branchIngredientsByProduct.get(productId) ?? [];
      if (!ingredientList.length) {
        return true;
      }
      return ingredientList.every((ingredient) => {
        const item = branchItemsById.get(ingredient.inventory_item_id);
        const required = Number(ingredient.quantity) * (1 + Number(ingredient.waste_factor ?? 0) / 100);
        return item ? item.isActive && item.currentStock >= required : false;
      });
    }

    return baseAvailability.map((availability) => {
      if (availability.isAvailableHere) {
        return availability;
      }

      const product = products.find((item) => item.id === availability.productId);
      const productName = normalizeProductName(product?.name ?? "");
      const alternatives = (branchProducts ?? [])
        .filter((branchProduct) => normalizeProductName(branchProduct.name) === productName && branchHasStock(branchProduct.id))
        .map((branchProduct) => {
          const branch = branchesById.get(branchProduct.restaurant_id);
          return branch
            ? {
                restaurantId: branch.id,
                restaurantName: branch.name,
                restaurantSlug: branch.slug,
                city: branch.city ?? "",
                address: branch.address ?? undefined,
              }
            : null;
        })
        .filter(Boolean)
        .slice(0, 3) as ProductStockAvailability["alternatives"];

      return { ...availability, reason: "stock", alternatives };
    });
  },

  async listFeaturedByRestaurant(restaurantId: string) {
    return (await this.listAvailableByRestaurant(restaurantId)).filter((product) => product.isFeatured);
  },

  async listConfigurationsByRestaurant(restaurantId: string) {
    if (!hasSupabaseEnv()) {
      return { variants: [], optionGroups: [] };
    }

    const totalStartedAt = perfNow();
    const supabase = await createClient();
    const variantsStartedAt = perfNow();
    const groupsStartedAt = perfNow();
    const optionsStartedAt = perfNow();
    const [{ data: variants, error: variantsError }, { data: groups, error: groupsError }, { data: options, error: optionsError }] = await Promise.all([
      supabase
        .from("product_variants")
        .select("id,restaurant_id,product_id,name,description,price_delta,sort_order,is_active")
        .eq("restaurant_id", restaurantId)
        .order("sort_order")
        .then((result) => {
          perfLog("[productService.listConfigurationsByRestaurant] variants-query", variantsStartedAt, { restaurantId, rows: result.data?.length ?? 0, error: Boolean(result.error) });
          return result;
        }),
      supabase
        .from("product_option_groups")
        .select("id,restaurant_id,product_id,name,description,min_choices,max_choices,is_required,sort_order,is_active")
        .eq("restaurant_id", restaurantId)
        .order("sort_order")
        .then((result) => {
          perfLog("[productService.listConfigurationsByRestaurant] groups-query", groupsStartedAt, { restaurantId, rows: result.data?.length ?? 0, error: Boolean(result.error) });
          return result;
        }),
      supabase
        .from("product_options")
        .select("id,restaurant_id,product_id,option_group_id,name,description,price_delta,inventory_item_id,inventory_quantity,inventory_waste_factor,sort_order,is_active")
        .eq("restaurant_id", restaurantId)
        .order("sort_order")
        .then((result) => {
          perfLog("[productService.listConfigurationsByRestaurant] options-query", optionsStartedAt, { restaurantId, rows: result.data?.length ?? 0, error: Boolean(result.error) });
          return result;
        }),
    ]);

    if (variantsError || groupsError || optionsError) {
      perfLog("[productService.listConfigurationsByRestaurant] total", totalStartedAt, { restaurantId, error: true });
      return { variants: [], optionGroups: [] };
    }

    const mapStartedAt = perfNow();
    const mappedOptions = (options ?? []).map(mapOption);
    const configuration = {
      variants: (variants ?? []).map(mapVariant),
      optionGroups: (groups ?? []).map((group) =>
        mapOptionGroup(
          group,
          mappedOptions.filter((option) => option.optionGroupId === group.id),
        ),
      ),
    };
    perfLog("[productService.listConfigurationsByRestaurant] map", mapStartedAt, { restaurantId, variants: configuration.variants.length, optionGroups: configuration.optionGroups.length, options: mappedOptions.length });
    perfLog("[productService.listConfigurationsByRestaurant] total", totalStartedAt, { restaurantId, variants: configuration.variants.length, optionGroups: configuration.optionGroups.length, options: mappedOptions.length });
    return configuration;
  },

  async listPublicConfigurationsByRestaurant(restaurantId: string) {
    if (!hasSupabaseEnv()) {
      return { variants: [], optionGroups: [] };
    }

    const supabase = createPublicServerClient();
    if (!supabase) {
      return { variants: [], optionGroups: [] };
    }

    const [{ data: variants, error: variantsError }, { data: groups, error: groupsError }, { data: options, error: optionsError }] = await Promise.all([
      supabase
        .from("product_variants")
        .select("id,restaurant_id,product_id,name,description,price_delta,sort_order,is_active")
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true)
        .order("sort_order"),
      supabase
        .from("product_option_groups")
        .select("id,restaurant_id,product_id,name,description,min_choices,max_choices,is_required,sort_order,is_active")
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true)
        .order("sort_order"),
      supabase
        .from("product_options")
        .select("id,restaurant_id,product_id,option_group_id,name,description,price_delta,inventory_item_id,inventory_quantity,inventory_waste_factor,sort_order,is_active")
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true)
        .order("sort_order"),
    ]);

    if (variantsError || groupsError || optionsError) {
      return { variants: [], optionGroups: [] };
    }

    const mappedOptions = (options ?? []).map(mapOption);
    return {
      variants: (variants ?? []).map(mapVariant),
      optionGroups: (groups ?? []).map((group) =>
        mapOptionGroup(
          group,
          mappedOptions.filter((option) => option.optionGroupId === group.id),
        ),
      ),
    };
  },
};
