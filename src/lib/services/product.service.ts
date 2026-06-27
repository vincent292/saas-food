import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import type { Product, ProductOption, ProductOptionGroup, ProductVariant } from "@/types/product.types";

function mapProduct(row: {
  id: string;
  restaurant_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  is_available: boolean;
  is_featured: boolean;
  order_count?: number | null;
  last_ordered_at?: string | null;
  track_stock: boolean;
  sort_order: number;
}, isAutoFeatured = false): Product {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    categoryId: row.category_id ?? "",
    name: row.name,
    description: row.description ?? "",
    price: Number(row.price),
    imageUrl: row.image_url ?? "",
    isAvailable: row.is_available,
    isFeatured: row.is_featured,
    isAutoFeatured,
    trackStock: row.track_stock,
    orderCount: Number(row.order_count ?? 0),
    lastOrderedAt: row.last_ordered_at ?? undefined,
    sortOrder: row.sort_order,
  };
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

    const supabase = await createClient();
    const { data, error } = await supabase.from("products").select("*").eq("restaurant_id", restaurantId).order("sort_order");

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

    return data.map((product) => mapProduct(product, mostOrderedIds.has(product.id)));
  },

  async listAvailableByRestaurant(restaurantId: string) {
    return (await this.listByRestaurant(restaurantId)).filter((product) => product.isAvailable);
  },

  async listFeaturedByRestaurant(restaurantId: string) {
    return (await this.listAvailableByRestaurant(restaurantId)).filter((product) => product.isFeatured);
  },

  async listConfigurationsByRestaurant(restaurantId: string) {
    if (!hasSupabaseEnv()) {
      return { variants: [], optionGroups: [] };
    }

    const supabase = await createClient();
    const [{ data: variants, error: variantsError }, { data: groups, error: groupsError }, { data: options, error: optionsError }] = await Promise.all([
      supabase.from("product_variants").select("*").eq("restaurant_id", restaurantId).order("sort_order"),
      supabase.from("product_option_groups").select("*").eq("restaurant_id", restaurantId).order("sort_order"),
      supabase.from("product_options").select("*").eq("restaurant_id", restaurantId).order("sort_order"),
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
