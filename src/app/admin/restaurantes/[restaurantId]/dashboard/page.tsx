import { notFound } from "next/navigation";
import { RestaurantDashboard } from "@/components/admin/RestaurantDashboard";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { modulesForAdminLayout } from "@/lib/modules";
import { restaurantAccessService } from "@/lib/services/restaurant-access.service";
import { restaurantService } from "@/lib/services/restaurant.service";

export default async function DashboardPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const restaurant = await restaurantService.getById(restaurantId);

  if (!restaurant) {
    notFound();
  }

  await restaurantAccessService.claimOrRedirect(restaurant.id, `/admin/restaurantes/${restaurant.id}/dashboard`);

  return (
    <AdminLayout
      active="dashboard"
      enabledModules={modulesForAdminLayout(restaurant)}
      restaurantId={restaurant.id}
      restaurantName={restaurant.name}
      restaurantStatus={restaurant.status}
      title={`Dashboard | ${restaurant.name}`}
    >
      <RestaurantDashboard restaurantId={restaurant.id} />
    </AdminLayout>
  );
}
