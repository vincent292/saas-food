import type { MetadataRoute } from "next";
import { restaurantService } from "@/lib/services/restaurant.service";
import { absoluteUrl } from "@/lib/seo/site-url";
import { publicRestaurantPath } from "@/lib/utils/public-routes";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const restaurants = await restaurantService.listPublicDirectoryRestaurants();

  return [
    {
      url: absoluteUrl("/"),
      changeFrequency: "hourly",
      priority: 1,
    },
    ...restaurants.map((restaurant) => ({
      url: absoluteUrl(publicRestaurantPath(restaurant.slug)),
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
  ];
}
