import { notFound } from "next/navigation";
import { KitchenBoardClient } from "@/components/kitchen/KitchenBoardClient";
import { RestaurantThemeProvider } from "@/components/restaurant/RestaurantThemeProvider";
import { kitchenService } from "@/lib/services/kitchen.service";
import { restaurantService } from "@/lib/services/restaurant.service";

export default async function KitchenPage({ params }: { params: Promise<{ restaurantSlug: string }> }) {
  const { restaurantSlug } = await params;
  const restaurant = await restaurantService.getBySlug(restaurantSlug);

  if (!restaurant) {
    notFound();
  }

  const [orders, settings] = await Promise.all([kitchenService.listKitchenOrders(restaurant.id), restaurantService.getSettings(restaurant.id)]);

  return (
    <RestaurantThemeProvider theme={restaurant.theme}>
      <KitchenBoardClient orders={orders} restaurant={restaurant} settings={settings} />
    </RestaurantThemeProvider>
  );
}
