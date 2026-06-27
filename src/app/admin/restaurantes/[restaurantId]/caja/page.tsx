import { notFound } from "next/navigation";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { CashWorkspaceClient } from "@/components/cash/CashWorkspaceClient";
import { hasRestaurantModule, modulesForAdminLayout } from "@/lib/modules";
import { cashService } from "@/lib/services/cash.service";
import { categoryService } from "@/lib/services/category.service";
import { orderService } from "@/lib/services/order.service";
import { productService } from "@/lib/services/product.service";
import { restaurantService } from "@/lib/services/restaurant.service";

export default async function CashPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantId: string }>;
  searchParams: Promise<{ tab?: string; error?: string; opened?: string; closed?: string; charged?: string; expense?: string; pos?: string; rejected?: string }>;
}) {
  const [{ restaurantId }, status] = await Promise.all([params, searchParams]);
  const restaurant = await restaurantService.getById(restaurantId);

  if (!restaurant || !hasRestaurantModule(restaurant, "cash")) {
    notFound();
  }

  const [summary, products, categories, configuration, movements, orders, reports] = await Promise.all([
    cashService.getSummary(restaurant.id),
    productService.listAvailableByRestaurant(restaurant.id),
    categoryService.listByRestaurant(restaurant.id),
    productService.listConfigurationsByRestaurant(restaurant.id),
    cashService.listMovements(restaurant.id),
    orderService.listByRestaurant(restaurant.id),
    cashService.listSessionReports(restaurant.id),
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
          status.rejected ?? "",
        ].join(":")}
        categories={categories}
        configuration={configuration}
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
