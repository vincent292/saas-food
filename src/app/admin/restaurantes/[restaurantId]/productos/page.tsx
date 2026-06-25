import { notFound } from "next/navigation";
import { createProductAction } from "@/app/admin/actions";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { formatMoney } from "@/lib/utils/money";
import { categoryService } from "@/lib/services/category.service";
import { productService } from "@/lib/services/product.service";
import { restaurantService } from "@/lib/services/restaurant.service";

export default async function ProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantId: string }>;
  searchParams: Promise<{ created?: string; error?: string }>;
}) {
  const [{ restaurantId }, status] = await Promise.all([params, searchParams]);
  const restaurant = await restaurantService.getById(restaurantId);

  if (!restaurant) {
    notFound();
  }

  const [products, categories] = await Promise.all([
    productService.listByRestaurant(restaurant.id),
    categoryService.listByRestaurant(restaurant.id),
  ]);

  return (
    <AdminLayout active="productos" restaurantId={restaurant.id} title="Productos">
      <SectionTitle title="Catálogo" description="Crea productos reales para el menú público por slug." />
      {status.created ? <div className="mt-4 rounded-2xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">Producto creado.</div> : null}
      {status.error ? <div className="mt-4 rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700">No se pudo guardar el producto.</div> : null}
      <form action={createProductAction} encType="multipart/form-data">
        <Card className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <input name="restaurantId" type="hidden" value={restaurant.id} />
          <Input name="name" placeholder="Nombre del producto" required />
          <Input min={0} name="price" placeholder="Precio" required step="0.01" type="number" />
          <Select name="categoryId">
            <option value="">Sin categoría</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
          <Input defaultValue={products.length + 1} min={0} name="sortOrder" placeholder="Orden" type="number" />
          <Input accept="image/*" className="xl:col-span-2" name="imageFile" type="file" />
          <Textarea className="xl:col-span-2" name="description" placeholder="Descripción del producto" />
          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold">
            <input name="isFeatured" type="checkbox" />
            Producto destacado
          </label>
          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold">
            <input name="trackStock" type="checkbox" />
            Controlar stock
          </label>
          <div className="xl:col-span-2">
            <Button>Nuevo producto</Button>
          </div>
        </Card>
      </form>
      <div className="mt-6">
        <DataTable
          headers={["Producto", "Precio", "Disponible", "Destacado", "Stock"]}
          rows={products.map((product) => [
            product.name,
            formatMoney(product.price),
            product.isAvailable ? "Sí" : "No",
            product.isFeatured ? "Sí" : "No",
            product.trackStock ? "Controla" : "No",
          ])}
        />
      </div>
    </AdminLayout>
  );
}
