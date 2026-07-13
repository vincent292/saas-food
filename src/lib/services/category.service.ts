import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import type { Category } from "@/types/product.types";

function mapCategory(row: {
  id: string;
  restaurant_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
}): Category {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    name: row.name,
    description: row.description ?? "",
    imageUrl: row.image_url ?? undefined,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  };
}

export const categoryService = {
  async listByRestaurant(restaurantId: string) {
    if (!hasSupabaseEnv()) {
      return [];
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true)
      .order("sort_order");

    if (error || !data?.length) {
      return [];
    }

    return data.map(mapCategory);
  },

  async listPublicByRestaurant(restaurantId: string) {
    if (!hasSupabaseEnv()) {
      return [];
    }

    const supabase = createPublicServerClient();
    if (!supabase) {
      return [];
    }

    const { data, error } = await supabase
      .from("categories")
      .select("id,restaurant_id,name,description,image_url,sort_order,is_active")
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true)
      .order("sort_order");

    if (error || !data?.length) {
      return [];
    }

    return data.map(mapCategory);
  },
};
