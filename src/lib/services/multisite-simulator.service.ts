import "server-only";

import type { MultisiteKitchenSnapshot } from "@/lib/group-orders/kitchen-forecast";
import { createClient } from "@/lib/supabase/server";

export type MultisiteSimulatorRestaurant = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  location: { latitude: number; longitude: number };
  kitchenSnapshot: MultisiteKitchenSnapshot;
};

function hasCoordinates<T extends { latitude: number | null; longitude: number | null }>(restaurant: T): restaurant is T & { latitude: number; longitude: number } {
  return typeof restaurant.latitude === "number" && typeof restaurant.longitude === "number" && Number.isFinite(restaurant.latitude) && Number.isFinite(restaurant.longitude);
}

function countByRestaurant(rows: Array<{ restaurant_id: string }>) {
  const values = new Map<string, number>();
  for (const row of rows) values.set(row.restaurant_id, (values.get(row.restaurant_id) ?? 0) + 1);
  return values;
}

export const multisiteSimulatorService = {
  async listOperationalRestaurants(): Promise<MultisiteSimulatorRestaurant[]> {
    const client = await createClient();

    const { data: restaurantRows, error: restaurantError } = await client
      .from("restaurants")
      .select("id,name,address,city,latitude,longitude")
      .eq("status", "active")
      .is("deleted_at", null)
      .order("name");
    if (restaurantError || !restaurantRows?.length) return [];

    const restaurantIds = restaurantRows.map((restaurant) => restaurant.id);
    const recentThreshold = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const [queueSettingsResult, activeOrdersResult, recentOrdersResult] = await Promise.all([
      client
        .from("restaurant_queue_settings")
        .select("restaurant_id,queue_enabled,base_prep_minutes,kitchen_capacity,rush_multiplier")
        .in("restaurant_id", restaurantIds),
      client
        .from("orders")
        .select("restaurant_id,status")
        .in("restaurant_id", restaurantIds)
        .in("status", ["pending", "accepted", "preparing"]),
      client
        .from("orders")
        .select("restaurant_id")
        .in("restaurant_id", restaurantIds)
        .neq("status", "cancelled")
        .gte("created_at", recentThreshold),
    ]);

    const queueByRestaurant = new Map((queueSettingsResult.data ?? []).map((row) => [row.restaurant_id, row]));
    const activeByRestaurant = countByRestaurant(activeOrdersResult.data ?? []);
    const preparingByRestaurant = countByRestaurant((activeOrdersResult.data ?? []).filter((row) => row.status === "preparing"));
    const recentByRestaurant = countByRestaurant(recentOrdersResult.data ?? []);

    return restaurantRows
      .filter(hasCoordinates)
      .map((restaurant) => {
        const queue = queueByRestaurant.get(restaurant.id);
        return {
          id: restaurant.id,
          name: restaurant.name,
          address: restaurant.address,
          city: restaurant.city,
          location: { latitude: restaurant.latitude, longitude: restaurant.longitude },
          kitchenSnapshot: {
            queueEnabled: queue?.queue_enabled ?? true,
            basePrepMinutes: Number(queue?.base_prep_minutes ?? 16),
            kitchenCapacity: Number(queue?.kitchen_capacity ?? 3),
            rushMultiplier: Number(queue?.rush_multiplier ?? 1.25),
            activeOrders: activeByRestaurant.get(restaurant.id) ?? 0,
            preparingOrders: preparingByRestaurant.get(restaurant.id) ?? 0,
            recentOrders: recentByRestaurant.get(restaurant.id) ?? 0,
          },
        } satisfies MultisiteSimulatorRestaurant;
      });
  },
};
