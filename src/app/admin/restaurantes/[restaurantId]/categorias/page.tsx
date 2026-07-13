import { notFound } from "next/navigation";
import { createCategoryAction } from "@/app/admin/actions";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { CompressedImageInput } from "@/components/settings/CompressedImageInput";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { Input, Textarea } from "@/components/ui/Input";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { hasRestaurantModule, modulesForAdminLayout } from "@/lib/modules";
import { categoryService } from "@/lib/services/category.service";
import { restaurantAccessService } from "@/lib/services/restaurant-access.service";
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

  if (!restaurant || !hasRestaurantModule(restaurant, "public_menu")) {
    notFound();
  }

  await restaurantAccessService.claimOrRedirect(restaurant.id, `/admin/restaurantes/${restaurant.id}/categorias`);

  const categories = await categoryService.listByRestaurant(restaurant.id);

  return (
    <AdminLayout
      active="categorias"
      enabledModules={modulesForAdminLayout(restaurant)}
      restaurantId={restaurant.id}
      restaurantName={restaurant.name}
      restaurantStatus={restaurant.status}
      title="Categorías"
    >
      <SectionTitle title="Categorías" description="Crea categorías reales para ordenar el menú público." />
      {status.created ? <div className="mt-4 rounded-2xl bg-[var(--color-success-soft)] p-3 text-sm font-semibold text-[var(--color-success-strong)]">Categoría creada.</div> : null}
      {status.error ? <div className="mt-4 rounded-2xl bg-[var(--color-danger-soft)] p-3 text-sm font-semibold text-[var(--color-danger-strong)]">No se pudo guardar la categoría.</div> : null}
      <form action={createCategoryAction}>
        <Card className="mt-6 grid gap-4 md:grid-cols-[1fr_1fr_160px_120px_auto] md:items-end">
          <input name="restaurantId" type="hidden" value={restaurant.id} />
          <Input name="name" placeholder="Nombre de categoría" required />
          <Textarea className="min-h-11" name="description" placeholder="Descripción corta" />
          <CompressedImageInput help="Recomendado: 1200 x 800 px. Se convertira a WebP antes de subir." label="Imagen" name="imageFile" />
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
