import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveDeliveryPolicy } from "@/lib/delivery-policy";
import { deliveryRateService } from "@/lib/services/delivery-rate.service";
import type { RestaurantDeliveryZone } from "@/types/restaurant.types";

type RestaurantRow = {
  id: string;
  city: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
};

type SettingsRow = {
  delivery_fee: number | string;
  delivery_qr_prepayment_enabled: boolean | null;
  far_delivery_distance_km: number | string | null;
  free_delivery_from: number | string | null;
  min_order_amount: number | string;
};

type ZoneRow = {
  id: string;
  restaurant_id: string;
  name: string;
  city: string | null;
  center_latitude: number | string | null;
  center_longitude: number | string | null;
  radius_km: number | string;
  delivery_fee: number | string;
  min_order_amount: number | string;
  is_active: boolean;
};

function mapZone(row: ZoneRow): RestaurantDeliveryZone {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    name: row.name,
    city: row.city ?? "",
    centerLatitude: row.center_latitude == null ? undefined : Number(row.center_latitude),
    centerLongitude: row.center_longitude == null ? undefined : Number(row.center_longitude),
    radiusKm: Number(row.radius_km),
    deliveryFee: Number(row.delivery_fee),
    minOrderAmount: Number(row.min_order_amount),
    isActive: row.is_active,
  };
}

export async function getRestaurantDeliveryQuote(
  client: SupabaseClient,
  input: { restaurantId: string; deliveryLatitude: number; deliveryLongitude: number; subtotal?: number },
) {
  const [{ data: restaurant }, { data: settings }, { data: zones }, distanceRateTiers] = await Promise.all([
    client
      .from("restaurants")
      .select("id,city,latitude,longitude")
      .eq("id", input.restaurantId)
      .eq("status", "active")
      .is("deleted_at", null)
      .maybeSingle(),
    client
      .from("restaurant_settings")
      .select("delivery_fee,delivery_qr_prepayment_enabled,far_delivery_distance_km,free_delivery_from,min_order_amount")
      .eq("restaurant_id", input.restaurantId)
      .maybeSingle(),
    client
      .from("restaurant_delivery_zones")
      .select("id,restaurant_id,name,city,center_latitude,center_longitude,radius_km,delivery_fee,min_order_amount,is_active")
      .eq("restaurant_id", input.restaurantId)
      .eq("is_active", true),
    deliveryRateService.list(client),
  ]);

  if (!restaurant) return null;
  const restaurantRow = restaurant as RestaurantRow;
  const settingsRow = settings as SettingsRow | null;
  const latitude = restaurantRow.latitude == null ? undefined : Number(restaurantRow.latitude);
  const longitude = restaurantRow.longitude == null ? undefined : Number(restaurantRow.longitude);
  const policy = resolveDeliveryPolicy({
    restaurantLocation: latitude == null || longitude == null ? undefined : { latitude, longitude },
    deliveryLocation: { latitude: input.deliveryLatitude, longitude: input.deliveryLongitude },
    restaurantCity: restaurantRow.city ?? "",
    deliveryCity: restaurantRow.city ?? "",
    zones: ((zones ?? []) as ZoneRow[]).map(mapZone),
    subtotal: input.subtotal ?? 0,
    baseDeliveryFee: Number(settingsRow?.delivery_fee ?? 0),
    baseMinOrderAmount: Number(settingsRow?.min_order_amount ?? 0),
    qrPrepaymentEnabled: settingsRow?.delivery_qr_prepayment_enabled ?? true,
    freeDeliveryFrom: Number(settingsRow?.free_delivery_from ?? 0),
    farDeliveryDistanceKm: Number(settingsRow?.far_delivery_distance_km ?? 5),
    distanceRateTiers,
  });

  return {
    distanceKm: policy.distanceKm == null ? undefined : Number(policy.distanceKm.toFixed(2)),
    deliveryFee: Number(policy.deliveryFee.toFixed(2)),
    minOrderAmount: policy.minOrderAmount,
    requiresQrPrepayment: policy.requiresQrPrepayment,
    outOfCoverage: policy.outOfCoverage,
    source: policy.matchedZone ? "restaurant_zone" as const : policy.matchedRateTier ? "platform_rate" as const : "restaurant_base" as const,
    label: policy.matchedZone?.name ?? (policy.matchedRateTier ? `${policy.matchedRateTier.minDistanceKm.toFixed(1)}–${policy.matchedRateTier.maxDistanceKm.toFixed(1)} km` : "Tarifa del local"),
  };
}

