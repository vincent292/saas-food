import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import type { Product } from "@/types/product.types";

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
  track_stock: boolean;
  sort_order: number;
}): Product {
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
    trackStock: row.track_stock,
    sortOrder: row.sort_order,
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

    return data.map(mapProduct);
  },

  async listAvailableByRestaurant(restaurantId: string) {
    return (await this.listByRestaurant(restaurantId)).filter((product) => product.isAvailable);
  },

  async listFeaturedByRestaurant(restaurantId: string) {
    return (await this.listAvailableByRestaurant(restaurantId)).filter((product) => product.isFeatured);
  },
};
