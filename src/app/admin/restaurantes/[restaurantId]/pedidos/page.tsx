import { notFound } from "next/navigation";
import { cashService } from "@/lib/services/cash.service";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { OrdersReceptionClient } from "@/components/orders/OrdersReceptionClient";
import { orderService } from "@/lib/services/order.service";
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

  if (!restaurant) {
    notFound();
  }

  const [orders, settings, session] = await Promise.all([orderService.listByRestaurant(restaurant.id), restaurantService.getSettings(restaurant.id), cashService.getOpenSession(restaurant.id)]);

  return (
    <AdminLayout active="pedidos" restaurantId={restaurant.id} title="Pedidos">
      <OrdersReceptionClient hasOpenSession={Boolean(session)} orders={orders} restaurant={restaurant} settings={settings} status={status} />
    </AdminLayout>
  );
}
