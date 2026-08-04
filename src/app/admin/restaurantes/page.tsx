import Link from "next/link";
import { Archive, Plus } from "lucide-react";
import { archiveRestaurantAction, setOwnerAccountStatusAction, setRestaurantStatusAction } from "@/app/admin/actions";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { restaurantBusinessTypeLabel, restaurantCategoryLabel } from "@/lib/restaurant-directory-options";
import { superadminService } from "@/lib/services/superadmin.service";
import { formatShortDate } from "@/lib/utils/dates";
import { formatMoney } from "@/lib/utils/money";
import { publicRestaurantPath } from "@/lib/utils/public-routes";
import type { RestaurantStatus } from "@/types/restaurant.types";

export default async function RestaurantsPage() {
  const restaurants = await superadminService.listRestaurantOperations();

  return (
    <AdminLayout active="/admin/restaurantes" title="Restaurantes">
      <SectionTitle
        action={
          <div className="flex flex-wrap gap-2">
            <Link className={buttonClasses("secondary")} href="/admin/restauracion">
              <Archive className="h-4 w-4" />
              Archivados
            </Link>
            <Link className={buttonClasses("primary")} href="/admin/restaurantes/nuevo">
              <Plus className="h-4 w-4" />
              Nuevo dueno
            </Link>
          </div>
        }
        description="Control de tenants, estado operativo, uso y acceso."
        title="Restaurantes"
      />
      <div className="mt-6">
        <DataTable
          emptyMessage="Todavia no hay restaurantes creados."
          headers={["Restaurante", "Responsable", "Tarifa", "Presencia", "Uso 30d", "Estado", "Sesiones", "Acciones"]}
          rows={restaurants.map((restaurant) => [
            <div key={`${restaurant.id}-name`}>
              <p className="font-black">{restaurant.name}</p>
              <p className="text-xs text-[var(--color-secondary-text)]">
                {publicRestaurantPath(restaurant.slug)}
                {restaurant.city ? ` · ${restaurant.city}` : ""}
                {restaurant.businessType ? ` · ${restaurantBusinessTypeLabel(restaurant.businessType)}` : ""}
                {restaurant.publicCategory ? ` · ${restaurantCategoryLabel(restaurant.publicCategory)}` : ""}
              </p>
            </div>,
            restaurant.ownerEmail || "Sin responsable",
            restaurant.planKey === "premium" ? "Full" : (restaurant.planKey ?? "sin tarifa"),
            <div key={`${restaurant.id}-presence`}>
              <p className={restaurant.publicPresenceStatus === "ready" ? "font-black text-[var(--color-success-strong)]" : restaurant.publicPresenceStatus === "critical" ? "font-black text-[var(--color-danger-strong)]" : "font-black text-[var(--color-warning-strong)]"}>
                {restaurant.publicPresenceScore}% listo
              </p>
              <p className="line-clamp-2 text-xs text-[var(--color-secondary-text)]">{restaurant.publicPresenceIssues.slice(0, 2).join(" | ") || "Lista para vender"}</p>
            </div>,
            <div key={`${restaurant.id}-usage`}>
              <p className="font-bold">{restaurant.orders30d} pedidos</p>
              <p className="text-xs text-[var(--color-secondary-text)]">
                {formatMoney(restaurant.revenue30d)} · {restaurant.lastOrderAt ? formatShortDate(restaurant.lastOrderAt) : "sin pedidos"}
              </p>
            </div>,
            <StatusBadge key={`${restaurant.id}-status`} status={restaurant.status} />,
            restaurant.activeSessions,
            <RestaurantActions key={`${restaurant.id}-actions`} ownerUserId={restaurant.ownerUserId} restaurantId={restaurant.id} status={restaurant.status} />,
          ])}
        />
      </div>
    </AdminLayout>
  );
}

function StatusBadge({ status }: { status: RestaurantStatus }) {
  const label = status === "active" ? "Activo" : status === "suspended" ? "Suspendido" : "Inactivo";
  const className =
    status === "active"
      ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]"
      : status === "suspended"
        ? "bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]"
        : "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]";

  return <Badge className={className}>{label}</Badge>;
}

function RestaurantActions({ ownerUserId, restaurantId, status }: { ownerUserId?: string; restaurantId: string; status: RestaurantStatus }) {
  const nextStatus: RestaurantStatus = status === "active" ? "suspended" : "active";
  const nextOwnerStatus = status === "suspended" ? "active" : "suspended";

  return (
    <div className="flex flex-wrap gap-2">
      <Link className={buttonClasses("secondary")} href={`/admin/restaurantes/${restaurantId}`}>
        Ficha
      </Link>
      <Link className={buttonClasses("secondary")} href={`/admin/restaurantes/${restaurantId}/cuenta`}>
        Cuenta
      </Link>
      {ownerUserId ? (
        <form action={setOwnerAccountStatusAction}>
          <input name="ownerUserId" type="hidden" value={ownerUserId} />
          <input name="restaurantId" type="hidden" value={restaurantId} />
          <input name="status" type="hidden" value={nextOwnerStatus} />
          <input name="returnTo" type="hidden" value="/admin/restaurantes" />
          <button className={buttonClasses(nextOwnerStatus === "active" ? "primary" : "secondary")} type="submit">
            {nextOwnerStatus === "active" ? "Reactivar cuenta" : "Suspender cuenta"}
          </button>
        </form>
      ) : (
        <form action={setRestaurantStatusAction}>
          <input name="restaurantId" type="hidden" value={restaurantId} />
          <input name="status" type="hidden" value={nextStatus} />
          <input name="returnTo" type="hidden" value="/admin/restaurantes" />
          <button className={buttonClasses(nextStatus === "active" ? "primary" : "secondary")} type="submit">
            {nextStatus === "active" ? "Activar" : "Suspender"}
          </button>
        </form>
      )}
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
