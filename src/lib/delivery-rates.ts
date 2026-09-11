export type DeliveryRateTier = {
  id?: string;
  minDistanceKm: number;
  maxDistanceKm: number;
  deliveryFee: number;
  isActive?: boolean;
  sortOrder?: number;
};

export const DEFAULT_DELIVERY_RATE_TIERS: DeliveryRateTier[] = [
  { minDistanceKm: 0, maxDistanceKm: 0.9, deliveryFee: 10 },
  { minDistanceKm: 1, maxDistanceKm: 2.9, deliveryFee: 12 },
  { minDistanceKm: 3, maxDistanceKm: 4.9, deliveryFee: 15 },
  { minDistanceKm: 5, maxDistanceKm: 6.9, deliveryFee: 18 },
  { minDistanceKm: 7, maxDistanceKm: 8.9, deliveryFee: 22 },
  { minDistanceKm: 9, maxDistanceKm: 10.9, deliveryFee: 27 },
  { minDistanceKm: 11, maxDistanceKm: 12.9, deliveryFee: 30 },
  { minDistanceKm: 13, maxDistanceKm: 13.9, deliveryFee: 35 },
  { minDistanceKm: 14, maxDistanceKm: 14.9, deliveryFee: 37 },
];

export function roundedDeliveryDistance(distanceKm: number) {
  return Math.round(Math.max(0, distanceKm) * 10) / 10;
}

export function findDeliveryRateTier(distanceKm: number, tiers: DeliveryRateTier[] = DEFAULT_DELIVERY_RATE_TIERS) {
  const roundedDistance = roundedDeliveryDistance(distanceKm);
  return tiers
    .filter((tier) => tier.isActive !== false)
    .sort((left, right) => left.minDistanceKm - right.minDistanceKm)
    .find((tier) => roundedDistance >= tier.minDistanceKm && roundedDistance <= tier.maxDistanceKm);
}

