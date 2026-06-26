import { notFound } from "next/navigation";
import { RestaurantDashboard } from "@/components/admin/RestaurantDashboard";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { restaurantService } from "@/lib/services/restaurant.service";

export default async function DashboardPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const restaurant = await restaurantService.getById(restaurantId);

  if (!restaurant) {
    notFound();
  }

  return (
    <AdminLayout active="dashboard" restaurantId={restaurant.id} title={`Dashboard | ${restaurant.name}`}>
      <RestaurantDashboard restaurantId={restaurant.id} />
    </AdminLayout>
  );
}
