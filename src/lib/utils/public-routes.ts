export function publicRestaurantPath(restaurantSlug: string, suffix = "") {
  const cleanSlug = restaurantSlug.replace(/^\/+|\/+$/g, "");
  const cleanSuffix = suffix ? `/${suffix.replace(/^\/+/, "")}` : "";
  return `/${cleanSlug}${cleanSuffix}`;
}
