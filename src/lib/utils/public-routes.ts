export function publicRestaurantPath(restaurantSlug: string, suffix = "") {
  const cleanSlug = restaurantSlug.replace(/^\/+|\/+$/g, "");
  const cleanSuffix = suffix ? `/${suffix.replace(/^\/+/, "")}` : "";
  return `/${cleanSlug}${cleanSuffix}`;
}

export function publicRestaurantOrderPath(restaurantSlug: string, error?: string) {
  const params = new URLSearchParams({ pedido: "1" });
  if (error) {
    params.set("error", error);
  }
  return `${publicRestaurantPath(restaurantSlug)}?${params.toString()}`;
}
