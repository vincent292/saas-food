export type Coordinates = {
  latitude: number;
  longitude: number;
};

export function hasValidCoordinates(latitude?: number | null, longitude?: number | null) {
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export function coordinatesToMapsUrl(latitude: number, longitude: number) {
  return `https://www.google.com/maps/search/?api=1&query=${latitude.toFixed(7)},${longitude.toFixed(7)}`;
}

export function directionsToMapsUrl({
  latitude,
  longitude,
  address,
}: {
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
}) {
  const lat = typeof latitude === "number" ? latitude : null;
  const lng = typeof longitude === "number" ? longitude : null;
  const destination = lat !== null && lng !== null && hasValidCoordinates(lat, lng)
    ? `${lat.toFixed(7)},${lng.toFixed(7)}`
    : (address ?? "").trim();

  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

export function searchMapsUrl(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
