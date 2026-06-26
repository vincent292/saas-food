import { notFound } from "next/navigation";
import { PublicRestaurantOrderClient } from "@/components/public-menu/PublicRestaurantOrderClient";
import { RestaurantThemeProvider } from "@/components/restaurant/RestaurantThemeProvider";
import { categoryService } from "@/lib/services/category.service";
import { productService } from "@/lib/services/product.service";
import { restaurantService } from "@/lib/services/restaurant.service";

export default async function RestaurantPublicPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantSlug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ restaurantSlug }, { error }] = await Promise.all([params, searchParams]);
  const restaurant = await restaurantService.getBySlug(restaurantSlug);

  if (!restaurant) {
    notFound();
  }

  const [settings, categories, products, configuration] = await Promise.all([
    restaurantService.getSettings(restaurant.id),
    categoryService.listByRestaurant(restaurant.id),
    productService.listAvailableByRestaurant(restaurant.id),
    productService.listConfigurationsByRestaurant(restaurant.id),
  ]);

  return (
    <RestaurantThemeProvider theme={restaurant.theme}>
      <PublicRestaurantOrderClient categories={categories} configuration={configuration} orderError={error} products={products} restaurant={restaurant} settings={settings} />
    </RestaurantThemeProvider>
  );
}
