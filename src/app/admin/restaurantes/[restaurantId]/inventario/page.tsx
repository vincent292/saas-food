import { notFound } from "next/navigation";
import { InventoryWorkspaceClient } from "@/components/inventory/InventoryWorkspaceClient";
import { hasRestaurantModule } from "@/lib/modules";
import { inventoryService } from "@/lib/services/inventory.service";
import { productService } from "@/lib/services/product.service";
import { restaurantService } from "@/lib/services/restaurant.service";

function getExpiringBeforeDate() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
}

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

  const expiringBeforeDate = getExpiringBeforeDate();

  const [items, suppliers, ingredients, movements, openCount, countReports, products, categories, zones, itemZones, productSuppliers, lots, branchTargets, branchTransfers] = await Promise.all([
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
    inventoryService.listLots(restaurant.id),
    inventoryService.listBranchTransferTargets(restaurant),
    inventoryService.listBranchTransfers(restaurant.id),
  ]);

  return (
    <InventoryWorkspaceClient
      countReports={countReports}
      categories={categories}
      ingredients={ingredients}
      initialTab={status.tab}
      itemZones={itemZones}
      items={items}
      branchTargets={branchTargets}
      branchTransfers={branchTransfers}
      expiringBeforeDate={expiringBeforeDate}
      lots={lots}
      movements={movements}
      openCount={openCount}
      productSuppliers={productSuppliers}
      products={products}
      restaurantId={restaurant.id}
      restaurantName={restaurant.name}
      suppliers={suppliers}
      zones={zones}
    />
  );
}
