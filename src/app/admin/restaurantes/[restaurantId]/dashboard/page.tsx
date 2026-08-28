import { notFound } from "next/navigation";
import { RestaurantDashboard } from "@/components/admin/RestaurantDashboard";
import { restaurantService } from "@/lib/services/restaurant.service";

export default async function DashboardPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const restaurant = await restaurantService.getById(restaurantId);

  if (!restaurant) {
    notFound();
  }

  return <RestaurantDashboard businessType={restaurant.businessType} restaurantId={restaurant.id} />;
}
