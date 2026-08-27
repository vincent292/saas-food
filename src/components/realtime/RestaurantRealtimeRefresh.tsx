"use client";

import { useRestaurantRealtimeRefresh } from "@/lib/client/use-restaurant-realtime-refresh";

export function RestaurantRealtimeRefresh({
  enabled = true,
  restaurantId,
  scope,
}: {
  enabled?: boolean;
  restaurantId?: string;
  scope: "cash" | "dashboard" | "kitchen" | "notifications" | "orders" | "owner";
}) {
  useRestaurantRealtimeRefresh({ enabled, restaurantId, scope });
  return null;
}
