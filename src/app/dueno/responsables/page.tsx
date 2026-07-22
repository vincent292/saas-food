import { Mail, Store, Users } from "lucide-react";
import { OwnerLayout, getOwnerLayoutContext } from "@/components/layout/OwnerLayout";
import { ResponsibleAccessActionsClient } from "@/components/owner/ResponsibleAccessActionsClient";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { listOwnerResponsibles } from "@/lib/services/owner-dashboard.service";

export default async function OwnerResponsiblesPage() {
  const { ownerMemberships, profile } = await getOwnerLayoutContext();
  const responsibles = (await listOwnerResponsibles(ownerMemberships)).filter((responsible) => responsible.userId !== profile.id);

  return (
    <OwnerLayout active="/dueno/responsables" memberships={ownerMemberships} title="Responsables">
      <div className="space-y-6">
        <Card className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--primary-light)] text-[var(--primary)]">
            <Users className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-2xl font-black">Usuarios por sucursal</h2>
            <p className="mt-1 text-sm font-semibold leading-6 text-[var(--color-secondary-text)]">
              Los responsables de sucursal entran solo a su panel operativo. El dueno conserva acceso a todas.
            </p>
          </div>
        </Card>

        <SectionTitle description="Accesos activos agrupados por sucursal." title="Equipo" />

        <div className="grid gap-3">
          {responsibles.map((responsible) => (
            <Card className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center" key={`${responsible.restaurantId}-${responsible.userId}-${responsible.role}`}>
              <div className="min-w-0">
                <p className="truncate text-lg font-black">{responsible.fullName}</p>
                <p className="mt-1 flex min-w-0 items-center gap-2 text-sm font-semibold text-[var(--color-secondary-text)]">
                  <Mail className="h-4 w-4 shrink-0" />
                  <span className="truncate">{responsible.email}</span>
                </p>
                <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-[var(--color-secondary-text)]">
                  <Store className="h-4 w-4" />
                  {responsible.restaurantName}
                </p>
              </div>
              <div className="space-y-3">
                <Badge className={responsible.isActive ? "justify-center bg-[var(--color-success-soft)] text-[var(--color-success-strong)]" : "justify-center bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]"}>{responsible.isActive ? "Activo" : "Desactivado"}</Badge>
                <ResponsibleAccessActionsClient isActive={responsible.isActive} restaurantId={responsible.restaurantId} targetUserId={responsible.userId} />
              </div>
            </Card>
          ))}

          {!responsibles.length ? (
            <Card className="border-dashed text-sm font-semibold text-[var(--color-secondary-text)]">
              Todavia no hay responsables visibles. Cuando crees sucursales, sus usuarios apareceran aqui.
            </Card>
          ) : null}
        </div>
      </div>
    </OwnerLayout>
  );
}
