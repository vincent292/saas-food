import { calculateDistanceKm, type GeoPoint } from "@/lib/utils/geo-distance";
import type { RestaurantDeliveryZone } from "@/types/restaurant.types";

export const DEFAULT_FAR_DELIVERY_DISTANCE_KM = 8;
export const DEFAULT_SAME_CITY_MAX_DISTANCE_KM = 50;

type DeliveryPolicyInput = {
  restaurantLocation?: GeoPoint;
  deliveryLocation?: GeoPoint;
  restaurantCity?: string;
  deliveryCity?: string;
  zones: RestaurantDeliveryZone[];
  subtotal: number;
  baseDeliveryFee: number;
  baseMinOrderAmount: number;
  freeDeliveryFrom?: number;
  farDeliveryDistanceKm?: number;
};

export type DeliveryPolicy = {
  distanceKm?: number;
  deliveryFee: number;
  minOrderAmount: number;
  requiresQrPrepayment: boolean;
  sameCity: boolean;
  matchedZone?: RestaurantDeliveryZone;
};

function normalizeCity(value?: string) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function validLocation(value?: GeoPoint): value is GeoPoint {
  return Boolean(
    value &&
      Number.isFinite(value.latitude) &&
      Number.isFinite(value.longitude) &&
      value.latitude >= -90 &&
      value.latitude <= 90 &&
      value.longitude >= -180 &&
      value.longitude <= 180,
  );
}

export function resolveDeliveryPolicy({
  restaurantLocation,
  deliveryLocation,
  restaurantCity,
  deliveryCity,
  zones,
  subtotal,
  baseDeliveryFee,
  baseMinOrderAmount,
  freeDeliveryFrom = 0,
  farDeliveryDistanceKm = DEFAULT_FAR_DELIVERY_DISTANCE_KM,
}: DeliveryPolicyInput): DeliveryPolicy {
  const normalizedRestaurantCity = normalizeCity(restaurantCity);
  const normalizedDeliveryCity = normalizeCity(deliveryCity);
  const distanceKm =
    validLocation(restaurantLocation) && validLocation(deliveryLocation)
      ? calculateDistanceKm(restaurantLocation, deliveryLocation)
      : undefined;
  const sameCity =
    (!normalizedRestaurantCity || normalizedRestaurantCity === normalizedDeliveryCity) &&
    (distanceKm == null || distanceKm <= DEFAULT_SAME_CITY_MAX_DISTANCE_KM);

  const matchingZones = zones
    .filter((zone) => {
      if (!zone.isActive || !validLocation(deliveryLocation)) {
        return false;
      }

      const zoneCenter =
        zone.centerLatitude != null && zone.centerLongitude != null
          ? { latitude: zone.centerLatitude, longitude: zone.centerLongitude }
          : restaurantLocation;

      if (!validLocation(zoneCenter)) {
        return false;
      }

      const zoneCity = normalizeCity(zone.city);
      return (!zoneCity || zoneCity === normalizedDeliveryCity) && calculateDistanceKm(zoneCenter, deliveryLocation) <= zone.radiusKm;
    })
    .sort((left, right) => left.radiusKm - right.radiusKm);

  const matchedZone = matchingZones[0];
  const configuredFee = matchedZone?.deliveryFee ?? baseDeliveryFee;
  const deliveryFee = freeDeliveryFrom > 0 && subtotal >= freeDeliveryFrom ? 0 : configuredFee;
  const minOrderAmount = matchedZone?.minOrderAmount ?? baseMinOrderAmount;
  const safeFarDistance = Math.max(1, Number(farDeliveryDistanceKm) || DEFAULT_FAR_DELIVERY_DISTANCE_KM);

  return {
    distanceKm,
    deliveryFee,
    minOrderAmount,
    requiresQrPrepayment: distanceKm != null && distanceKm > safeFarDistance,
    sameCity,
    matchedZone,
  };
}
