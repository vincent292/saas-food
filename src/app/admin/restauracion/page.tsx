import { RotateCcw, Trash2 } from "lucide-react";
import { permanentlyDeleteRestaurantAction, restoreRestaurantAction } from "@/app/admin/actions";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { buttonClasses } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { restaurantService } from "@/lib/services/restaurant.service";
import { formatShortDate } from "@/lib/utils/dates";

export default async function RestorationPage() {
  const restaurants = await restaurantService.listDeletedRestaurants();

  return (
    <AdminLayout active="/admin/restauracion" title="Restauración">
      <SectionTitle
        description="Restaurantes archivados quedan fuera del acceso normal. La eliminación definitiva exige confirmar el slug."
        title="Archivados y eliminación definitiva"
      />
      <div className="mt-6">
        <DataTable
          emptyMessage="No hay restaurantes archivados."
          headers={["Restaurante", "Slug", "Responsable", "Archivado", "Acciones"]}
          rows={restaurants.map((restaurant) => [
            restaurant.name,
            restaurant.slug,
            restaurant.ownerEmail || "Sin responsable",
            restaurant.deletedAt ? formatShortDate(restaurant.deletedAt) : "Sin fecha",
            <div className="grid gap-2" key={restaurant.id}>
              <form action={restoreRestaurantAction}>
                <input name="restaurantId" type="hidden" value={restaurant.id} />
                <input name="returnTo" type="hidden" value="/admin/restauracion" />
                <button className={buttonClasses("secondary", "w-full")} type="submit">
                  <RotateCcw className="h-4 w-4" />
                  Restaurar
                </button>
              </form>
              <form action={permanentlyDeleteRestaurantAction} className="flex flex-col gap-2">
                <input name="restaurantId" type="hidden" value={restaurant.id} />
                <input name="returnTo" type="hidden" value="/admin/restauracion" />
                <input
                  aria-label={`Confirmar slug ${restaurant.slug}`}
                  className="min-h-10 rounded-2xl border border-red-200 px-3 text-sm outline-none"
                  name="confirmationSlug"
                  placeholder={`Escribe ${restaurant.slug}`}
                />
                <button className={buttonClasses("danger", "w-full")} type="submit">
                  <Trash2 className="h-4 w-4" />
                  Eliminar definitivo
                </button>
              </form>
            </div>,
          ])}
        />
      </div>
    </AdminLayout>
  );
}
