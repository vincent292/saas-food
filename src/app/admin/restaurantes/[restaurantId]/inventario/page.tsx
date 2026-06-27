import { notFound } from "next/navigation";
import { InventoryWorkspaceClient } from "@/components/inventory/InventoryWorkspaceClient";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { hasRestaurantModule, modulesForAdminLayout } from "@/lib/modules";
import { inventoryService } from "@/lib/services/inventory.service";
import { productService } from "@/lib/services/product.service";
import { restaurantService } from "@/lib/services/restaurant.service";

export default async function InventoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ restaurantId }, status] = await Promise.all([params, searchParams]);
  const restaurant = await restaurantService.getById(restaurantId);

  if (!restaurant || !hasRestaurantModule(restaurant, "inventory")) {
    notFound();
  }

  const [items, suppliers, ingredients, movements, openCount, countReports, products, categories, zones, itemZones, productSuppliers] = await Promise.all([
    inventoryService.listItems(restaurant.id),
    inventoryService.listSuppliers(restaurant.id),
    inventoryService.listProductIngredients(restaurant.id),
    inventoryService.listMovements(restaurant.id),
    inventoryService.getOpenCount(restaurant.id),
    inventoryService.listCountReports(restaurant.id, { status: "closed", limit: 6 }),
    productService.listByRestaurant(restaurant.id),
    inventoryService.listCategories(restaurant.id),
    inventoryService.listZones(restaurant.id),
    inventoryService.listItemZones(restaurant.id),
    inventoryService.listProductSuppliers(restaurant.id),
  ]);

  return (
    <AdminLayout
      active="inventario"
      enabledModules={modulesForAdminLayout(restaurant)}
      restaurantId={restaurant.id}
      restaurantName={restaurant.name}
      restaurantStatus={restaurant.status}
      title="Inventario"
    >
      <InventoryWorkspaceClient
        countReports={countReports}
        categories={categories}
        ingredients={ingredients}
        initialTab={status.tab}
        itemZones={itemZones}
        items={items}
        movements={movements}
        openCount={openCount}
        productSuppliers={productSuppliers}
        products={products}
        restaurantId={restaurant.id}
        suppliers={suppliers}
        zones={zones}
      />
    </AdminLayout>
  );
}
