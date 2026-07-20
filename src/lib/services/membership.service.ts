import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import type { AppRole, RestaurantStatus } from "@/types/restaurant.types";

export type UserRestaurantMembership = {
  restaurantId: string;
  role: AppRole;
  restaurant: {
    id: string;
    name: string;
    slug: string;
    city: string;
    status: RestaurantStatus;
  };
};

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

  async listActiveRestaurantsForUser(userId: string): Promise<UserRestaurantMembership[]> {
    if (!hasSupabaseEnv()) {
      return [];
    }

    const supabase = await createClient();
    const { data: memberships, error: membershipError } = await supabase
      .from("restaurant_memberships")
      .select("restaurant_id, role")
      .eq("user_id", userId)
      .eq("is_active", true);

    if (membershipError || !memberships?.length) {
      return [];
    }

    const rolesByRestaurant = new Map<string, AppRole>();
    for (const membership of memberships) {
      if (!rolesByRestaurant.has(membership.restaurant_id)) {
        rolesByRestaurant.set(membership.restaurant_id, membership.role as AppRole);
      }
    }

    const restaurantIds = Array.from(rolesByRestaurant.keys());
    const { data: restaurants, error: restaurantError } = await supabase
      .from("restaurants")
      .select("id,name,slug,city,status")
      .in("id", restaurantIds)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    if (restaurantError || !restaurants?.length) {
      return [];
    }

    return restaurants.map((restaurant) => ({
      restaurantId: restaurant.id,
      role: rolesByRestaurant.get(restaurant.id) ?? "restaurant_admin",
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        city: restaurant.city ?? "",
        status: restaurant.status as RestaurantStatus,
      },
    }));
  },
};
