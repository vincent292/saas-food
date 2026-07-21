import { RotateCcw, Trash2 } from "lucide-react";
import { permanentlyDeleteRestaurantAction, restoreRestaurantAction } from "@/app/admin/actions";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { buttonClasses } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { restaurantService } from "@/lib/services/restaurant.service";
import { formatShortDate } from "@/lib/utils/dates";

const restorationMessages: Record<string, string> = {
  "archive-required": "Primero archiva el restaurante desde la lista principal antes de eliminarlo definitivamente.",
  "confirmation-required": "Para eliminar definitivamente debes escribir el slug exacto del restaurante.",
  "invalid-delete": "Escribe el slug exacto para confirmar la eliminacion definitiva.",
  "invalid-restaurant": "Selecciona un restaurante valido.",
  "restaurant-not-found": "No encontramos ese restaurante archivado.",
  "not-found": "No encontramos ese restaurante archivado.",
  denied: "No tienes permisos para esta accion.",
};

export default async function RestorationPage({ searchParams }: { searchParams: Promise<{ deleted?: string; error?: string; restored?: string }> }) {
  const [{ deleted, error, restored }, restaurants] = await Promise.all([searchParams, restaurantService.listDeletedRestaurants()]);

  return (
    <AdminLayout active="/admin/restauracion" title="Restauracion">
      <SectionTitle
        description="Restaurantes archivados quedan fuera del acceso normal. La eliminacion definitiva exige confirmar el slug."
        title="Archivados y eliminacion definitiva"
      />
      {error ? (
        <div className="mt-6 rounded-2xl border border-[var(--color-danger-soft)] bg-[var(--color-danger-soft)] p-4 text-sm font-semibold text-[var(--color-danger-strong)]" role="alert">
          {restorationMessages[error] ?? "No se pudo completar la accion. Revisa los datos e intenta nuevamente."}
        </div>
      ) : null}
      {deleted ? (
        <div className="mt-6 rounded-2xl border border-[var(--color-success-soft)] bg-[var(--color-success-soft)] p-4 text-sm font-semibold text-[var(--color-success-strong)]" role="status">
          Restaurante eliminado definitivamente.
        </div>
      ) : null}
      {restored ? (
        <div className="mt-6 rounded-2xl border border-[var(--color-success-soft)] bg-[var(--color-success-soft)] p-4 text-sm font-semibold text-[var(--color-success-strong)]" role="status">
          Restaurante restaurado correctamente.
        </div>
      ) : null}
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
                  className="min-h-10 rounded-2xl border border-[var(--color-danger-soft)] px-3 text-sm outline-none"
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
