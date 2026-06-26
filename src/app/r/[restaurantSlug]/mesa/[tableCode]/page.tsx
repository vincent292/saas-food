import { notFound } from "next/navigation";
import { RestaurantThemeProvider } from "@/components/restaurant/RestaurantThemeProvider";
import { TableOrderClient } from "@/components/tables/TableOrderClient";
import { categoryService } from "@/lib/services/category.service";
import { productService } from "@/lib/services/product.service";
import { restaurantService } from "@/lib/services/restaurant.service";
import { tableService } from "@/lib/services/table.service";

export default async function TableOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantSlug: string; tableCode: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ restaurantSlug, tableCode }, { error }] = await Promise.all([params, searchParams]);
  const restaurant = await restaurantService.getBySlug(restaurantSlug);

  if (!restaurant) {
    notFound();
  }

  const table = await tableService.getByCode(restaurant.id, decodeURIComponent(tableCode));

  if (!table) {
    notFound();
  }

  const [categories, products, settings, configuration] = await Promise.all([
    categoryService.listByRestaurant(restaurant.id),
    productService.listAvailableByRestaurant(restaurant.id),
    restaurantService.getSettings(restaurant.id),
    productService.listConfigurationsByRestaurant(restaurant.id),
  ]);

  return (
    <RestaurantThemeProvider theme={restaurant.theme}>
      <TableOrderClient categories={categories} configuration={configuration} orderError={error} products={products} restaurant={restaurant} settings={settings} table={table} />
    </RestaurantThemeProvider>
  );
}
