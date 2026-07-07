import Link from "next/link";
import { Archive, Plus } from "lucide-react";
import { archiveRestaurantAction, setRestaurantStatusAction } from "@/app/admin/actions";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { restaurantCategoryLabel } from "@/lib/restaurant-directory-options";
import { superadminService } from "@/lib/services/superadmin.service";
import { formatShortDate } from "@/lib/utils/dates";
import { formatMoney } from "@/lib/utils/money";
import type { RestaurantStatus } from "@/types/restaurant.types";

export default async function RestaurantsPage() {
  const restaurants = await superadminService.listRestaurantOperations();

  return (
    <AdminLayout active="/admin/restaurantes" title="Restaurantes">
      <SectionTitle
        action={
          <Link className={buttonClasses("primary")} href="/admin/restaurantes/nuevo">
            <Plus className="h-4 w-4" />
            Nuevo restaurante
          </Link>
        }
        description="Control de tenants, estado operativo, uso y acceso."
        title="Restaurantes"
      />
      <div className="mt-6">
        <DataTable
          emptyMessage="Todavía no hay restaurantes creados."
          headers={["Restaurante", "Responsable", "Plan", "Uso 30d", "Estado", "Sesiones", "Acciones"]}
          rows={restaurants.map((restaurant) => [
            <div key={`${restaurant.id}-name`}>
              <p className="font-black">{restaurant.name}</p>
              <p className="text-xs text-[var(--color-secondary-text)]">
                /r/{restaurant.slug}
                {restaurant.city ? ` · ${restaurant.city}` : ""}{restaurant.publicCategory ? ` · ${restaurantCategoryLabel(restaurant.publicCategory)}` : ""}
              </p>
            </div>,
            restaurant.ownerEmail || "Sin responsable",
            restaurant.planKey ?? "sin plan",
            <div key={`${restaurant.id}-usage`}>
              <p className="font-bold">{restaurant.orders30d} pedidos</p>
              <p className="text-xs text-[var(--color-secondary-text)]">
                {formatMoney(restaurant.revenue30d)} · {restaurant.lastOrderAt ? formatShortDate(restaurant.lastOrderAt) : "sin pedidos"}
              </p>
            </div>,
            <StatusBadge key={`${restaurant.id}-status`} status={restaurant.status} />,
            restaurant.activeSessions,
            <RestaurantActions key={`${restaurant.id}-actions`} restaurantId={restaurant.id} status={restaurant.status} />,
          ])}
        />
      </div>
    </AdminLayout>
  );
}

function StatusBadge({ status }: { status: RestaurantStatus }) {
  const label = status === "active" ? "Activo" : status === "suspended" ? "Suspendido" : "Inactivo";
  const className = status === "active" ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]" : status === "suspended" ? "bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]" : "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]";

  return <Badge className={className}>{label}</Badge>;
}

function RestaurantActions({ restaurantId, status }: { restaurantId: string; status: RestaurantStatus }) {
  const nextStatus: RestaurantStatus = status === "active" ? "suspended" : "active";

  return (
    <div className="flex flex-wrap gap-2">
      <Link className={buttonClasses("secondary")} href={`/admin/restaurantes/${restaurantId}`}>
        Ficha
      </Link>
      <form action={setRestaurantStatusAction}>
        <input name="restaurantId" type="hidden" value={restaurantId} />
        <input name="status" type="hidden" value={nextStatus} />
        <input name="returnTo" type="hidden" value="/admin/restaurantes" />
        <button className={buttonClasses(nextStatus === "active" ? "primary" : "secondary")} type="submit">
          {nextStatus === "active" ? "Activar" : "Suspender"}
        </button>
      </form>
      <form action={archiveRestaurantAction}>
        <input name="restaurantId" type="hidden" value={restaurantId} />
        <input name="returnTo" type="hidden" value="/admin/restaurantes" />
        <button className={buttonClasses("danger")} type="submit">
          <Archive className="h-4 w-4" />
          Archivar
        </button>
      </form>
    </div>
  );
}
