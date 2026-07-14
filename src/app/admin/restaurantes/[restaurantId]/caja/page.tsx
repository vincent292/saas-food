import { notFound } from "next/navigation";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { CashWorkspaceClient, type CashPageStatus } from "@/components/cash/CashWorkspaceClient";
import { hasRestaurantModule, modulesForAdminLayout } from "@/lib/modules";
import { cashService } from "@/lib/services/cash.service";
import { categoryService } from "@/lib/services/category.service";
import { orderService } from "@/lib/services/order.service";
import { productService } from "@/lib/services/product.service";
import { restaurantAccessService } from "@/lib/services/restaurant-access.service";
import { restaurantService } from "@/lib/services/restaurant.service";
import type { ProductConfiguration } from "@/types/product.types";

type CashTab = "venta" | "pedidos" | "delivery" | "recojo" | "movimientos" | "egresos" | "cierre" | "reportes";

const emptyConfiguration: ProductConfiguration = { variants: [], optionGroups: [] };

function normalizeTab(value: string | undefined): CashTab {
  if (value === "pedidos" || value === "delivery" || value === "recojo" || value === "movimientos" || value === "egresos" || value === "cierre" || value === "reportes") {
    return value;
  }
  return "venta";
}

export default async function CashPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantId: string }>;
  searchParams: Promise<CashPageStatus>;
}) {
  const [{ restaurantId }, status] = await Promise.all([params, searchParams]);
  const restaurant = await restaurantService.getById(restaurantId);

  if (!restaurant || !hasRestaurantModule(restaurant, "cash")) {
    notFound();
  }

  await restaurantAccessService.claimOrRedirect(restaurant.id, `/admin/restaurantes/${restaurant.id}/caja`);

  const activeTab = normalizeTab(status.tab);
  const needsPosCatalog = activeTab === "venta";
  const needsOperationalOrders = activeTab === "pedidos" || activeTab === "delivery" || activeTab === "recojo" || activeTab === "movimientos";
  const needsMovements = activeTab === "movimientos";
  const needsReports = activeTab === "reportes";

  const [summary, products, categories, configuration, movements, orders, reports] = await Promise.all([
    cashService.getSummary(restaurant.id),
    needsPosCatalog ? productService.listAvailableByRestaurant(restaurant.id) : Promise.resolve([]),
    needsPosCatalog ? categoryService.listByRestaurant(restaurant.id) : Promise.resolve([]),
    needsPosCatalog ? productService.listConfigurationsByRestaurant(restaurant.id) : Promise.resolve(emptyConfiguration),
    needsMovements ? cashService.listMovements(restaurant.id) : Promise.resolve([]),
    needsOperationalOrders ? orderService.listCashWorkspaceOrders(restaurant.id) : Promise.resolve([]),
    needsReports ? cashService.listSessionReports(restaurant.id) : Promise.resolve([]),
  ]);

  return (
    <AdminLayout
      active="caja"
      enabledModules={modulesForAdminLayout(restaurant)}
      restaurantId={restaurant.id}
      restaurantName={restaurant.name}
      restaurantStatus={restaurant.status}
      title="Caja / POS"
    >
      <CashWorkspaceClient
        key={[
          restaurant.id,
          summary.session?.id ?? "no-session",
          status.tab ?? "venta",
          status.error ?? "",
          status.opened ?? "",
          status.closed ?? "",
          status.charged ?? "",
          status.expense ?? "",
          status.pos ?? "",
          status.posOrderId ?? "",
          status.posOrderNumber ?? "",
          status.posTrackingToken ?? "",
          status.posCustomerPhone ?? "",
          status.rejected ?? "",
        ].join(":")}
        categories={categories}
        configuration={configuration}
        loadedTab={activeTab}
        movements={movements}
        orders={orders}
        products={products}
        reports={reports}
        restaurant={restaurant}
        status={status}
        summary={summary}
      />
    </AdminLayout>
  );
}
