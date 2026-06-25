import { notFound } from "next/navigation";
import { RestaurantThemeProvider } from "@/components/restaurant/RestaurantThemeProvider";
import { TableOrderClient } from "@/components/tables/TableOrderClient";
import { categoryService } from "@/lib/services/category.service";
import { productService } from "@/lib/services/product.service";
import { restaurantService } from "@/lib/services/restaurant.service";
import { tableService } from "@/lib/services/table.service";

export default async function TableOrderPage({ params }: { params: Promise<{ restaurantSlug: string; tableCode: string }> }) {
  const { restaurantSlug, tableCode } = await params;
  const restaurant = await restaurantService.getBySlug(restaurantSlug);

  if (!restaurant) {
    notFound();
  }

  const table = await tableService.getByCode(restaurant.id, decodeURIComponent(tableCode));

  if (!table) {
    notFound();
  }

  const [categories, products, settings] = await Promise.all([
    categoryService.listByRestaurant(restaurant.id),
    productService.listAvailableByRestaurant(restaurant.id),
    restaurantService.getSettings(restaurant.id),
  ]);

  return (
    <RestaurantThemeProvider theme={restaurant.theme}>
      <TableOrderClient categories={categories} products={products} restaurant={restaurant} settings={settings} table={table} />
    </RestaurantThemeProvider>
  );
}
