import { notFound } from "next/navigation";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { CashWorkspaceClient, type CashPageStatus } from "@/components/cash/CashWorkspaceClient";
import { hasRestaurantModule, modulesForAdminLayout } from "@/lib/modules";
import { cashService } from "@/lib/services/cash.service";
import { categoryService } from "@/lib/services/category.service";
import { orderService } from "@/lib/services/order.service";
import { printConnectorService } from "@/lib/services/print-connector.service";
import { productService } from "@/lib/services/product.service";
import { restaurantAccessService } from "@/lib/services/restaurant-access.service";
import { restaurantService } from "@/lib/services/restaurant.service";
import { measurePerf, perfLog, perfNow } from "@/lib/utils/perf";
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
  const pageStartedAt = perfNow();
  const [{ restaurantId }, status] = await Promise.all([params, searchParams]);
  const restaurantPromise = measurePerf("[caja-page] restaurantService.getWorkspaceById", () => restaurantService.getWorkspaceById(restaurantId), { restaurantId });
  const accessPromise = measurePerf(
    "[caja-page] restaurantAccessService.claimOrRedirect",
    () =>
      restaurantAccessService.claimOrRedirect(restaurantId, `/admin/restaurantes/${restaurantId}/caja`, {
        skipRestaurantLookup: true,
      }),
    { restaurantId },
  );
  const [restaurant] = await Promise.all([restaurantPromise, accessPromise]);

  if (!restaurant || !hasRestaurantModule(restaurant, "cash")) {
    notFound();
  }

  const activeTab = normalizeTab(status.tab);
  const needsPosCatalog = activeTab === "venta";
  const needsOperationalOrders = activeTab === "pedidos" || activeTab === "delivery" || activeTab === "recojo" || activeTab === "movimientos";
  const needsMovements = activeTab === "movimientos";
  const needsReports = activeTab === "cierre" || activeTab === "reportes";
  const needsCancellationReviewCount = activeTab === "cierre";
  const needsFullCashSummary = activeTab === "venta" || activeTab === "movimientos" || activeTab === "egresos" || needsReports;

  const [summary, settings, products, categories, configuration, movements, orders, reports, pendingCancellationReviews, cashAudit, printConnectorLink] = await Promise.all([
    measurePerf(needsFullCashSummary ? "[caja-page] cashService.getSummary" : "[caja-page] cashService.getSessionStatusSummary", () => (needsFullCashSummary ? cashService.getSummary(restaurant.id) : cashService.getSessionStatusSummary(restaurant.id)), { tab: activeTab }),
    measurePerf("[caja-page] restaurantService.getSettings", () => restaurantService.getSettings(restaurant.id), { tab: activeTab }),
    needsPosCatalog ? measurePerf("[caja-page] productService.listAvailableByRestaurant", () => productService.listAvailableByRestaurant(restaurant.id), { tab: activeTab }) : Promise.resolve([]),
    needsPosCatalog ? measurePerf("[caja-page] categoryService.listByRestaurant", () => categoryService.listByRestaurant(restaurant.id), { tab: activeTab }) : Promise.resolve([]),
    needsPosCatalog ? measurePerf("[caja-page] productService.listConfigurationsByRestaurant", () => productService.listConfigurationsByRestaurant(restaurant.id), { tab: activeTab }) : Promise.resolve(emptyConfiguration),
    needsMovements ? measurePerf("[caja-page] cashService.listMovements", () => cashService.listMovements(restaurant.id), { tab: activeTab }) : Promise.resolve([]),
    needsOperationalOrders ? measurePerf("[caja-page] orderService.listCashWorkspaceOrders", () => orderService.listCashWorkspaceOrders(restaurant.id), { tab: activeTab }) : Promise.resolve([]),
    needsReports ? measurePerf("[caja-page] cashService.listSessionReports", () => cashService.listSessionReports(restaurant.id), { tab: activeTab }) : Promise.resolve([]),
    needsCancellationReviewCount ? measurePerf("[caja-page] cashService.countPendingCashCancellationReviews", () => cashService.countPendingCashCancellationReviews(restaurant.id), { tab: activeTab }) : Promise.resolve(0),
    needsReports ? measurePerf("[caja-page] cashService.getAuditSnapshot", () => cashService.getAuditSnapshot(restaurant.id), { tab: activeTab }) : Promise.resolve(null),
    measurePerf("[caja-page] printConnectorService.getActiveForRestaurant", () => printConnectorService.getActiveForRestaurant(restaurant.id), { tab: activeTab }),
  ]);

  perfLog("[caja-page] total-before-render", pageStartedAt, { tab: activeTab, restaurantId: restaurant.id, orders: orders.length });

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
        printConnectorLink={printConnectorLink}
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
