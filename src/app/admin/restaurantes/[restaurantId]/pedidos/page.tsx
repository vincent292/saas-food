import { notFound } from "next/navigation";
import { cashService } from "@/lib/services/cash.service";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { OrdersReceptionClient } from "@/components/orders/OrdersReceptionClient";
import { hasRestaurantModule, modulesForAdminLayout } from "@/lib/modules";
import { categoryService } from "@/lib/services/category.service";
import { orderService } from "@/lib/services/order.service";
import { printConnectorService } from "@/lib/services/print-connector.service";
import { productService } from "@/lib/services/product.service";
import { restaurantAccessService } from "@/lib/services/restaurant-access.service";
import { restaurantService } from "@/lib/services/restaurant.service";
import { measurePerf, perfLog, perfNow } from "@/lib/utils/perf";
import type { ProductConfiguration } from "@/types/product.types";

const emptyConfiguration: ProductConfiguration = { variants: [], optionGroups: [] };

export default async function OrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantId: string }>;
  searchParams: Promise<{ updated?: string; charged?: string; pos?: string; posOrderNumber?: string; rejected?: string; refunded?: string; error?: string; tab?: string }>;
}) {
  const pageStartedAt = perfNow();
  const [{ restaurantId }, status] = await Promise.all([params, searchParams]);
  const restaurantPromise = measurePerf("[pedidos-page] restaurantService.getWorkspaceById", () => restaurantService.getWorkspaceById(restaurantId), { restaurantId });
  const accessPromise = measurePerf(
    "[pedidos-page] restaurantAccessService.claimOrRedirect",
    () =>
      restaurantAccessService.claimOrRedirect(restaurantId, `/admin/restaurantes/${restaurantId}/pedidos`, {
        skipRestaurantLookup: true,
      }),
    { restaurantId },
  );
  const [restaurant] = await Promise.all([restaurantPromise, accessPromise]);

  if (!restaurant || !hasRestaurantModule(restaurant, "orders")) {
    notFound();
  }

  const canUsePos = hasRestaurantModule(restaurant, "cash");
  const [orders, settings, cashSummary, products, categories, configuration, printConnectorLink] = await Promise.all([
    measurePerf("[pedidos-page] orderService.listCashWorkspaceOrders", () => orderService.listCashWorkspaceOrders(restaurant.id)),
    measurePerf("[pedidos-page] restaurantService.getSettings", () => restaurantService.getSettings(restaurant.id)),
    measurePerf("[pedidos-page] cashService.getSessionStatusSummary", () => cashService.getSessionStatusSummary(restaurant.id)),
    canUsePos ? measurePerf("[pedidos-page] productService.listAvailableByRestaurant", () => productService.listAvailableByRestaurant(restaurant.id)) : Promise.resolve([]),
    canUsePos ? measurePerf("[pedidos-page] categoryService.listByRestaurant", () => categoryService.listByRestaurant(restaurant.id)) : Promise.resolve([]),
    canUsePos ? measurePerf("[pedidos-page] productService.listConfigurationsByRestaurant", () => productService.listConfigurationsByRestaurant(restaurant.id)) : Promise.resolve(emptyConfiguration),
    measurePerf("[pedidos-page] printConnectorService.getActiveForRestaurant", () => printConnectorService.getActiveForRestaurant(restaurant.id)),
  ]);
  perfLog("[pedidos-page] total-before-render", pageStartedAt, { restaurantId: restaurant.id, orders: orders.length, canUsePos });

  return (
    <AdminLayout
      active="pedidos"
      enabledModules={modulesForAdminLayout(restaurant)}
      restaurantId={restaurant.id}
      restaurantName={restaurant.name}
      restaurantStatus={restaurant.status}
      title="Pedidos"
    >
      <OrdersReceptionClient categories={categories} configuration={configuration} hasOpenSession={Boolean(cashSummary.session)} orders={orders} printConnectorLink={printConnectorLink} products={products} restaurant={restaurant} settings={settings} showFloatingPos={canUsePos} status={status} />
    </AdminLayout>
  );
}
