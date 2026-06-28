import { redirect } from "next/navigation";
import { hasRestaurantModule } from "@/lib/modules";
import { restaurantAccessService } from "@/lib/services/restaurant-access.service";
import { restaurantService } from "@/lib/services/restaurant.service";

export default async function AdminKitchenEntryPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const restaurant = await restaurantService.getById(restaurantId);

  if (!restaurant || !hasRestaurantModule(restaurant, "kitchen")) {
    redirect("/admin/restaurantes");
  }

  await restaurantAccessService.claimOrRedirect(restaurant.id, `/admin/restaurantes/${restaurant.id}/cocina`);

  redirect(`/cocina/${restaurant.slug}`);
}
