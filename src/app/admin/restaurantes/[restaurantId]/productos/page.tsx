import { notFound } from "next/navigation";
import { ProductManagementClient } from "@/components/products/ProductManagementClient";
import { hasRestaurantModule } from "@/lib/modules";
import { authService } from "@/lib/services/auth.service";
import { categoryService } from "@/lib/services/category.service";
import { inventoryService } from "@/lib/services/inventory.service";
import { productService } from "@/lib/services/product.service";
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

  const [products, categories, configuration, inventoryItems, currentProfile] = await Promise.all([
    productService.listByRestaurant(restaurant.id),
    categoryService.listByRestaurant(restaurant.id),
    productService.listConfigurationsByRestaurant(restaurant.id),
    hasRestaurantModule(restaurant, "inventory") ? inventoryService.listItems(restaurant.id) : Promise.resolve([]),
    authService.getCurrentProfile(),
  ]);
  const canManageProducts = currentProfile?.globalRole === "superadmin" || currentProfile?.id === restaurant.ownerUserId;

  return (
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
  );
}
