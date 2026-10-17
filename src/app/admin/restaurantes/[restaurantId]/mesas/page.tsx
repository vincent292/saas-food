import { notFound } from "next/navigation";
import { TableManagementClient } from "@/components/tables/TableManagementClient";
import { TableServiceInbox } from "@/components/tables/TableServiceInbox";
import { hasRestaurantModule } from "@/lib/modules";
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

  return <div className="space-y-4"><TableServiceInbox restaurantId={restaurant.id} /><TableManagementClient restaurant={restaurant} status={status} tables={tables} /></div>;
}
