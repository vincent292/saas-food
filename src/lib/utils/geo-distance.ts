export type GeoPoint = {
  latitude: number;
  longitude: number;
};

export function calculateDistanceKm(from: GeoPoint, to: GeoPoint) {
  const radius = 6371;
  const latDelta = ((to.latitude - from.latitude) * Math.PI) / 180;
  const lonDelta = ((to.longitude - from.longitude) * Math.PI) / 180;
  const fromLat = (from.latitude * Math.PI) / 180;
  const toLat = (to.latitude * Math.PI) / 180;
  const a = Math.sin(latDelta / 2) ** 2 + Math.cos(fromLat) * Math.cos(toLat) * Math.sin(lonDelta / 2) ** 2;

  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistance(value: number) {
  if (value < 1) {
    return `${Math.max(50, Math.round((value * 1000) / 50) * 50)} m`;
  }

  return `${value < 10 ? value.toFixed(1) : Math.round(value)} km`;
}
