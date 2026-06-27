import { notFound } from "next/navigation";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { TableManagementClient } from "@/components/tables/TableManagementClient";
import { hasRestaurantModule, modulesForAdminLayout } from "@/lib/modules";
import { restaurantService } from "@/lib/services/restaurant.service";
import { tableService } from "@/lib/services/table.service";

export default async function TablesPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantId: string }>;
  searchParams: Promise<{ created?: string; updated?: string; deleted?: string; error?: string }>;
}) {
  const [{ restaurantId }, status] = await Promise.all([params, searchParams]);
  const restaurant = await restaurantService.getById(restaurantId);

  if (!restaurant || !hasRestaurantModule(restaurant, "table_qr")) {
    notFound();
  }

  const tables = await tableService.listByRestaurant(restaurant.id);

  return (
    <AdminLayout
      active="mesas"
      enabledModules={modulesForAdminLayout(restaurant)}
      restaurantId={restaurant.id}
      restaurantName={restaurant.name}
      restaurantStatus={restaurant.status}
      title="Mesas QR"
    >
      <TableManagementClient restaurant={restaurant} status={status} tables={tables} />
    </AdminLayout>
  );
}
