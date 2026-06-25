import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { restaurantService } from "./restaurant.service";

export const settingsService = {
  async getRestaurantSettings(restaurantId: string) {
    return restaurantService.getSettings(restaurantId);
  },
  async listBusinessHours(restaurantId: string) {
    if (!hasSupabaseEnv()) {
      return [];
    }

    const supabase = await createClient();
    const { data, error } = await supabase.from("business_hours").select("*").eq("restaurant_id", restaurantId).order("day_of_week");

    if (error || !data?.length) {
      return [];
    }

    return data.map((hour) => ({
      dayOfWeek: hour.day_of_week,
      opensAt: hour.opens_at ?? "",
      closesAt: hour.closes_at ?? "",
      isClosed: hour.is_closed,
    }));
  },
};
