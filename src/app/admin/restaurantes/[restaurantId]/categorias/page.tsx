import { notFound } from "next/navigation";
import { createCategoryAction } from "@/app/admin/actions";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { FormSubmitButton } from "@/components/ui/FormSubmitButton";
import { Input, Textarea } from "@/components/ui/Input";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { hasRestaurantModule, modulesForAdminLayout } from "@/lib/modules";
import { authService } from "@/lib/services/auth.service";
import { categoryService } from "@/lib/services/category.service";
import { restaurantAccessService } from "@/lib/services/restaurant-access.service";
import { restaurantService } from "@/lib/services/restaurant.service";

const categoryErrorMessages: Record<string, string> = {
  invalid: "Revisa el nombre y el orden.",
  "storage-upload": "La imagen no pudo subirse. Puedes crear la categoria sin foto.",
  "23505": "Ya existe una categoria con esos datos.",
  "42501": "Tu usuario no tiene permiso para crear categorias en este restaurante.",
  "owner-required": "Solo el dueno de la cuenta puede crear categorias.",
  "service-role-required": "Falta SUPABASE_SERVICE_ROLE_KEY para guardar sin bloqueo de RLS.",
};

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

  const [categories, currentProfile] = await Promise.all([categoryService.listByRestaurant(restaurant.id), authService.getCurrentProfile()]);
  const canManageCatalog = currentProfile?.globalRole === "superadmin" || currentProfile?.id === restaurant.ownerUserId;

  return (
    <AdminLayout
      active="categorias"
      enabledModules={modulesForAdminLayout(restaurant)}
      restaurantId={restaurant.id}
      restaurantName={restaurant.name}
      restaurantStatus={restaurant.status}
      title="Categorias"
    >
      <SectionTitle
        title="Categorias"
        description={canManageCatalog ? "Crea categorias reales para ordenar el menu publico." : "Categorias en modo consulta. Los cambios del catalogo los realiza el dueno de la cuenta."}
      />
      {status.created ? <div className="mt-4 rounded-2xl bg-[var(--color-success-soft)] p-3 text-sm font-semibold text-[var(--color-success-strong)]">Categoria creada.</div> : null}
      {status.error ? (
        <div className="mt-4 rounded-2xl bg-[var(--color-danger-soft)] p-3 text-sm font-semibold text-[var(--color-danger-strong)]">
          No se pudo guardar la categoria. {categoryErrorMessages[status.error] ?? `Detalle: ${status.error}.`}
        </div>
      ) : null}
      {canManageCatalog ? (
        <form action={createCategoryAction}>
          <Card className="mt-5 grid gap-3 p-4 sm:p-5 xl:grid-cols-[minmax(220px,1fr)_minmax(280px,1.4fr)_120px_auto] xl:items-end">
            <input name="restaurantId" type="hidden" value={restaurant.id} />
            <label className="space-y-2">
              <span className="text-xs font-black uppercase tracking-[0.12em] text-[var(--muted)]">Nombre</span>
              <Input name="name" placeholder="Ej. Hamburguesas" required />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-black uppercase tracking-[0.12em] text-[var(--muted)]">Descripcion interna</span>
              <Textarea className="min-h-11" name="description" placeholder="Opcional, solo para organizar el panel" />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-black uppercase tracking-[0.12em] text-[var(--muted)]">Orden</span>
              <Input defaultValue={categories.length + 1} min={0} name="sortOrder" placeholder="Orden" type="number" />
            </label>
            <FormSubmitButton
              className="min-h-11 w-full whitespace-nowrap xl:w-auto"
              label="Nueva categoria"
              overlayDescription="Estamos creando la categoria y actualizando el catalogo."
              overlayTitle="Creando categoria"
              pendingLabel="Creando..."
            />
          </Card>
        </form>
      ) : (
        <div className="mt-5 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--color-card-muted)] p-4 text-sm font-semibold text-[var(--muted)]">
          Puedes revisar categorias, orden y visibilidad. Para crear o reorganizar el catalogo, ingresa con la cuenta duena o superadmin.
        </div>
      )}
      <div className="mt-6">
        <DataTable
          headers={["Nombre", "Descripcion", "Orden", "Visible"]}
          rows={categories.map((category) => [category.name, category.description, category.sortOrder, category.isActive ? "Si" : "No"])}
        />
      </div>
    </AdminLayout>
  );
}
