import { notFound } from "next/navigation";
import { cashService } from "@/lib/services/cash.service";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { OrdersReceptionClient } from "@/components/orders/OrdersReceptionClient";
import { hasRestaurantModule, modulesForAdminLayout } from "@/lib/modules";
import { categoryService } from "@/lib/services/category.service";
import { orderService } from "@/lib/services/order.service";
import { productService } from "@/lib/services/product.service";
import { restaurantAccessService } from "@/lib/services/restaurant-access.service";
import { restaurantService } from "@/lib/services/restaurant.service";
import type { ProductConfiguration } from "@/types/product.types";

const emptyConfiguration: ProductConfiguration = { variants: [], optionGroups: [] };

export default async function OrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantId: string }>;
  searchParams: Promise<{ updated?: string; charged?: string; pos?: string; posOrderNumber?: string; rejected?: string; refunded?: string; error?: string; tab?: string }>;
}) {
  const [{ restaurantId }, status] = await Promise.all([params, searchParams]);
  const restaurant = await restaurantService.getById(restaurantId);

  if (!restaurant || !hasRestaurantModule(restaurant, "orders")) {
    notFound();
  }

  await restaurantAccessService.claimOrRedirect(restaurant.id, `/admin/restaurantes/${restaurant.id}/pedidos`);

  const canUsePos = hasRestaurantModule(restaurant, "cash");
  const [orders, settings, session, products, categories, configuration] = await Promise.all([
    orderService.listCashWorkspaceOrders(restaurant.id),
    restaurantService.getSettings(restaurant.id),
    cashService.getOpenSession(restaurant.id),
    canUsePos ? productService.listAvailableByRestaurant(restaurant.id) : Promise.resolve([]),
    canUsePos ? categoryService.listByRestaurant(restaurant.id) : Promise.resolve([]),
    canUsePos ? productService.listConfigurationsByRestaurant(restaurant.id) : Promise.resolve(emptyConfiguration),
  ]);

  return (
    <AdminLayout
      active="pedidos"
      enabledModules={modulesForAdminLayout(restaurant)}
      restaurantId={restaurant.id}
      restaurantName={restaurant.name}
      restaurantStatus={restaurant.status}
      title="Pedidos"
    >
      <OrdersReceptionClient categories={categories} configuration={configuration} hasOpenSession={Boolean(session)} orders={orders} products={products} restaurant={restaurant} settings={settings} showFloatingPos={canUsePos} status={status} />
    </AdminLayout>
  );
}
