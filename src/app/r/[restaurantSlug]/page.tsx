import { notFound } from "next/navigation";
import { PublicRestaurantOrderClient } from "@/components/public-menu/PublicRestaurantOrderClient";
import { RestaurantThemeProvider } from "@/components/restaurant/RestaurantThemeProvider";
import { categoryService } from "@/lib/services/category.service";
import { productService } from "@/lib/services/product.service";
import { publicDirectoryService } from "@/lib/services/public-directory.service";
import { restaurantService } from "@/lib/services/restaurant.service";
import { settingsService } from "@/lib/services/settings.service";
import type { ProductConfiguration } from "@/types/product.types";
import type { BusinessHour, Restaurant, RestaurantSettings } from "@/types/restaurant.types";

type PublicRestaurantPageData = {
  restaurant: Restaurant;
  settings: RestaurantSettings | null;
  businessHours: BusinessHour[];
  categories: Awaited<ReturnType<typeof categoryService.listPublicByRestaurant>>;
  products: Awaited<ReturnType<typeof productService.listPublicAvailableByRestaurant>>;
  configuration: ProductConfiguration;
};

const PUBLIC_RESTAURANT_PAGE_TTL_MS = 15_000;
const publicRestaurantPageCache = new Map<string, { expiresAt: number; data: PublicRestaurantPageData | null }>();

async function getPublicRestaurantPageData(restaurantSlug: string) {
  const cached = publicRestaurantPageCache.get(restaurantSlug);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const restaurant = await restaurantService.getPublicBySlug(restaurantSlug);

  if (!restaurant) {
    publicRestaurantPageCache.set(restaurantSlug, { expiresAt: Date.now() + PUBLIC_RESTAURANT_PAGE_TTL_MS, data: null });
    return null;
  }

  const [settings, businessHours, categories, products, configuration] = await Promise.all([
    settingsService.getPublicRestaurantSettings(restaurant.id),
    settingsService.listPublicBusinessHours(restaurant.id),
    categoryService.listPublicByRestaurant(restaurant.id),
    productService.listPublicAvailableByRestaurant(restaurant.id),
    productService.listPublicConfigurationsByRestaurant(restaurant.id),
  ]);

  const data = { restaurant, settings, businessHours, categories, products, configuration };
  publicRestaurantPageCache.set(restaurantSlug, { expiresAt: Date.now() + PUBLIC_RESTAURANT_PAGE_TTL_MS, data });

  return data;
}

export default async function RestaurantPublicPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantSlug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ restaurantSlug }, { error }] = await Promise.all([params, searchParams]);
  const pageData = await getPublicRestaurantPageData(restaurantSlug);

  if (!pageData) {
    notFound();
  }

  const { restaurant, settings, businessHours, categories, products, configuration } = pageData;
  publicDirectoryService.recordVisit(restaurant.id).catch(() => null);

  return (
    <RestaurantThemeProvider>
      <PublicRestaurantOrderClient businessHours={businessHours} categories={categories} configuration={configuration} orderError={error} products={products} restaurant={restaurant} settings={settings} />
    </RestaurantThemeProvider>
  );
}
