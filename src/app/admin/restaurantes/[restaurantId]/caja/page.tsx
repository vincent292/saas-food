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
  const needsOperationalOrders = true;
  const needsMovements = activeTab === "movimientos";
  const needsReports = activeTab === "cierre" || activeTab === "reportes";

  const [summary, settings, products, categories, configuration, movements, orders, reports, pendingCancellationReviews, cashAudit] = await Promise.all([
    cashService.getSummary(restaurant.id),
    restaurantService.getSettings(restaurant.id),
    needsPosCatalog ? productService.listAvailableByRestaurant(restaurant.id) : Promise.resolve([]),
    needsPosCatalog ? categoryService.listByRestaurant(restaurant.id) : Promise.resolve([]),
    needsPosCatalog ? productService.listConfigurationsByRestaurant(restaurant.id) : Promise.resolve(emptyConfiguration),
    needsMovements ? cashService.listMovements(restaurant.id) : Promise.resolve([]),
    needsOperationalOrders ? orderService.listCashWorkspaceOrders(restaurant.id) : Promise.resolve([]),
    needsReports ? cashService.listSessionReports(restaurant.id) : Promise.resolve([]),
    cashService.countPendingCashCancellationReviews(restaurant.id),
    needsReports ? cashService.getAuditSnapshot(restaurant.id) : Promise.resolve(null),
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
        cashAudit={cashAudit}
        configuration={configuration}
        loadedTab={activeTab}
        movements={movements}
        orders={orders}
        pendingCancellationReviews={pendingCancellationReviews}
        products={products}
        reports={reports}
        restaurant={restaurant}
        settings={settings}
        status={status}
        summary={summary}
      />
    </AdminLayout>
  );
}
