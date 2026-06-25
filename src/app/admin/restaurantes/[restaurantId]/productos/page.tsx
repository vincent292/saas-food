import { notFound } from "next/navigation";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { ProductManagementClient } from "@/components/products/ProductManagementClient";
import { categoryService } from "@/lib/services/category.service";
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

  const [products, categories, configuration] = await Promise.all([
    productService.listByRestaurant(restaurant.id),
    categoryService.listByRestaurant(restaurant.id),
    productService.listConfigurationsByRestaurant(restaurant.id),
  ]);

  return (
    <AdminLayout active="productos" restaurantId={restaurant.id} title="Productos">
      <ProductManagementClient
        categories={categories}
        categoryCreated={status.categoryCreated}
        configuration={configuration}
        created={status.created}
        error={status.error}
        products={products}
        restaurantId={restaurant.id}
        updated={status.updated}
      />
    </AdminLayout>
  );
}
