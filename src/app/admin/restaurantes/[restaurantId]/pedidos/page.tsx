import { notFound } from "next/navigation";
import { cashService } from "@/lib/services/cash.service";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { OrdersReceptionClient } from "@/components/orders/OrdersReceptionClient";
import { hasRestaurantModule, modulesForAdminLayout } from "@/lib/modules";
import { orderService } from "@/lib/services/order.service";
import { restaurantAccessService } from "@/lib/services/restaurant-access.service";
import { restaurantService } from "@/lib/services/restaurant.service";

export default async function OrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantId: string }>;
  searchParams: Promise<{ updated?: string; charged?: string; rejected?: string; error?: string }>;
}) {
  const [{ restaurantId }, status] = await Promise.all([params, searchParams]);
  const restaurant = await restaurantService.getById(restaurantId);

  if (!restaurant || !hasRestaurantModule(restaurant, "orders")) {
    notFound();
  }

  await restaurantAccessService.claimOrRedirect(restaurant.id, `/admin/restaurantes/${restaurant.id}/pedidos`);

  const [orders, settings, session] = await Promise.all([orderService.listByRestaurant(restaurant.id), restaurantService.getSettings(restaurant.id), cashService.getOpenSession(restaurant.id)]);

  return (
    <AdminLayout
      active="pedidos"
      enabledModules={modulesForAdminLayout(restaurant)}
      restaurantId={restaurant.id}
      restaurantName={restaurant.name}
      restaurantStatus={restaurant.status}
      title="Pedidos"
    >
      <OrdersReceptionClient hasOpenSession={Boolean(session)} orders={orders} restaurant={restaurant} settings={settings} status={status} />
    </AdminLayout>
  );
}
