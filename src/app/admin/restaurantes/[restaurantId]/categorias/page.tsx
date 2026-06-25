import { notFound } from "next/navigation";
import { createCategoryAction } from "@/app/admin/actions";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { Input, Textarea } from "@/components/ui/Input";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { categoryService } from "@/lib/services/category.service";
import { restaurantService } from "@/lib/services/restaurant.service";

export default async function CategoriesPage({
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

  const categories = await categoryService.listByRestaurant(restaurant.id);

  return (
    <AdminLayout active="categorias" restaurantId={restaurant.id} title="Categorías">
      <SectionTitle title="Categorías" description="Crea categorías reales para ordenar el menú público." />
      {status.created ? <div className="mt-4 rounded-2xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">Categoría creada.</div> : null}
      {status.error ? <div className="mt-4 rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700">No se pudo guardar la categoría.</div> : null}
      <form action={createCategoryAction} encType="multipart/form-data">
        <Card className="mt-6 grid gap-4 md:grid-cols-[1fr_1fr_160px_120px_auto] md:items-end">
          <input name="restaurantId" type="hidden" value={restaurant.id} />
          <Input name="name" placeholder="Nombre de categoría" required />
          <Textarea className="min-h-11" name="description" placeholder="Descripción corta" />
          <Input accept="image/*" name="imageFile" type="file" />
          <Input defaultValue={categories.length + 1} min={0} name="sortOrder" placeholder="Orden" type="number" />
          <Button>Nueva categoría</Button>
        </Card>
      </form>
      <div className="mt-6">
        <DataTable
          headers={["Nombre", "Descripción", "Orden", "Visible"]}
          rows={categories.map((category) => [category.name, category.description, category.sortOrder, category.isActive ? "Sí" : "No"])}
        />
      </div>
    </AdminLayout>
  );
}
