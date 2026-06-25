import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import type { RestaurantTable } from "@/types/order.types";

function mapTable(row: {
  id: string;
  restaurant_id: string;
  name: string;
  code: string;
  status: RestaurantTable["status"];
  capacity: number;
  is_active: boolean;
}): RestaurantTable {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    name: row.name,
    code: row.code,
    status: row.status,
    capacity: row.capacity,
    isActive: row.is_active,
  };
}

export const tableService = {
  async listByRestaurant(restaurantId: string) {
    if (!hasSupabaseEnv()) {
      return [];
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tables")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true)
      .order("name");

    if (error || !data?.length) {
      return [];
    }

    return data.map(mapTable);
  },

  async getByCode(restaurantId: string, tableCode: string) {
    if (!hasSupabaseEnv()) {
      return null;
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tables")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .eq("code", tableCode)
      .eq("is_active", true)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return mapTable(data);
  },
};
