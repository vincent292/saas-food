import { notFound } from "next/navigation";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { ProductManagementClient } from "@/components/products/ProductManagementClient";
import { hasRestaurantModule, modulesForAdminLayout } from "@/lib/modules";
import { authService } from "@/lib/services/auth.service";
import { categoryService } from "@/lib/services/category.service";
import { inventoryService } from "@/lib/services/inventory.service";
import { productService } from "@/lib/services/product.service";
import { restaurantAccessService } from "@/lib/services/restaurant-access.service";
import { restaurantService } from "@/lib/services/restaurant.service";

export default async function ProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantId: string }>;
  searchParams: Promise<{ created?: string; updated?: string; categoryCreated?: string; error?: string }>;
}) {
  const [{ restaurantId }, status] = await Promise.all([params, searchParams]);
  const restaurant = await restaurantService.getById(restaurantId);

  if (!restaurant) {
    notFound();
  }

  if (!hasRestaurantModule(restaurant, "public_menu")) {
    notFound();
  }

  await restaurantAccessService.claimOrRedirect(restaurant.id, `/admin/restaurantes/${restaurant.id}/productos`);

  const [products, categories, configuration, inventoryItems, currentProfile] = await Promise.all([
    productService.listByRestaurant(restaurant.id),
    categoryService.listByRestaurant(restaurant.id),
    productService.listConfigurationsByRestaurant(restaurant.id),
    hasRestaurantModule(restaurant, "inventory") ? inventoryService.listItems(restaurant.id) : Promise.resolve([]),
    authService.getCurrentProfile(),
  ]);
  const canManageProducts = currentProfile?.globalRole === "superadmin" || currentProfile?.id === restaurant.ownerUserId;

  return (
    <AdminLayout
      active="productos"
      enabledModules={modulesForAdminLayout(restaurant)}
      restaurantId={restaurant.id}
      restaurantName={restaurant.name}
      restaurantStatus={restaurant.status}
      title="Productos"
    >
      <ProductManagementClient
        categories={categories}
        businessType={restaurant.businessType}
        canManageProducts={canManageProducts}
        categoryCreated={status.categoryCreated}
        configuration={configuration}
        created={status.created}
        error={status.error}
        inventoryItems={inventoryItems}
        products={products}
        restaurantId={restaurant.id}
        updated={status.updated}
      />
    </AdminLayout>
  );
}
