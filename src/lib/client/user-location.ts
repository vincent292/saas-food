import type { GeoPoint } from "@/lib/utils/geo-distance";

export const USER_LOCATION_STORAGE_KEY = "yopido:user-location";
export const USER_LOCATION_UPDATED_EVENT = "yopido:user-location-updated";

const MAX_LOCATION_AGE_MS = 1000 * 60 * 60 * 6;

type StoredUserLocation = GeoPoint & {
  capturedAt: number;
};

function isStoredLocation(value: unknown): value is StoredUserLocation {
  if (!value || typeof value !== "object") return false;
  const location = value as Partial<StoredUserLocation>;
  return typeof location.latitude === "number" && typeof location.longitude === "number" && typeof location.capturedAt === "number";
}

export function readUserLocation() {
  try {
    const raw = window.localStorage.getItem(USER_LOCATION_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    if (!isStoredLocation(parsed) || Date.now() - parsed.capturedAt > MAX_LOCATION_AGE_MS) {
      window.localStorage.removeItem(USER_LOCATION_STORAGE_KEY);
      return null;
    }

    return { latitude: parsed.latitude, longitude: parsed.longitude };
  } catch {
    return null;
  }
}

export function writeUserLocation(location: GeoPoint) {
  try {
    const stored: StoredUserLocation = { ...location, capturedAt: Date.now() };
    window.localStorage.setItem(USER_LOCATION_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Storage can fail in private mode. The custom event still updates the current page.
  }

  window.dispatchEvent(new CustomEvent<GeoPoint>(USER_LOCATION_UPDATED_EVENT, { detail: location }));
}
