import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";

export const membershipService = {
  async listByRestaurant(restaurantId: string) {
    if (!hasSupabaseEnv()) {
      return [];
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("restaurant_memberships")
      .select("user_id, restaurant_id, role, is_active")
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true);

    if (error || !data?.length) {
      return [];
    }

    return data.map((membership) => ({
      userId: membership.user_id,
      restaurantId: membership.restaurant_id,
      role: membership.role,
      isActive: membership.is_active,
    }));
  },
};
