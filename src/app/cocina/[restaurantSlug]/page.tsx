import { notFound, redirect } from "next/navigation";
import { KitchenBoardClient } from "@/components/kitchen/KitchenBoardClient";
import { RestaurantThemeProvider } from "@/components/restaurant/RestaurantThemeProvider";
import { hasRestaurantModule } from "@/lib/modules";
import { authService } from "@/lib/services/auth.service";
import { kitchenService } from "@/lib/services/kitchen.service";
import { restaurantAccessService } from "@/lib/services/restaurant-access.service";
import { restaurantService } from "@/lib/services/restaurant.service";

export default async function KitchenPage({ params }: { params: Promise<{ restaurantSlug: string }> }) {
  const { restaurantSlug } = await params;
  const profile = await authService.getCurrentProfile();

  if (!profile) {
    redirect("/admin/login?error=session");
  }

  if (profile.mustChangePassword) {
    redirect("/admin/cambiar-contrasena");
  }

  const restaurant = await restaurantService.getOperationalBySlug(restaurantSlug);

  if (!restaurant || !hasRestaurantModule(restaurant, "kitchen")) {
    notFound();
  }

  await restaurantAccessService.claimOrRedirect(restaurant.id, `/cocina/${restaurant.slug}`);

  const [orders, settings] = await Promise.all([kitchenService.listKitchenOrders(restaurant.id), restaurantService.getSettings(restaurant.id)]);

  return (
    <RestaurantThemeProvider>
      <KitchenBoardClient orders={orders} restaurant={restaurant} settings={settings} />
    </RestaurantThemeProvider>
  );
}
