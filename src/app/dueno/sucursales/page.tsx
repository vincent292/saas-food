import Link from "next/link";
import { ArrowRight, Building2, MapPin, Plus, ShieldCheck } from "lucide-react";
import { OwnerLayout, getOwnerLayoutContext } from "@/components/layout/OwnerLayout";
import { BranchSummaryCard } from "@/components/owner/OwnerDashboard";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { getOwnerBranchCapacity, getOwnerBranchSummaries } from "@/lib/services/owner-dashboard.service";
import { publicRestaurantPath } from "@/lib/utils/public-routes";

export default async function OwnerBranchesPage({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  const [{ created }, { ownerMemberships }] = await Promise.all([searchParams, getOwnerLayoutContext({ active: "/dueno/sucursales" })]);
  const [capacity, summaries] = await Promise.all([getOwnerBranchCapacity(ownerMemberships), getOwnerBranchSummaries(ownerMemberships)]);
  const remaining = Math.max(0, capacity.limit - capacity.used);

  return (
    <OwnerLayout active="/dueno/sucursales" memberships={ownerMemberships} title="Sucursales">
      <div className="space-y-6">
        {created ? (
          <div className="rounded-2xl border border-[var(--color-success-soft)] bg-[var(--color-success-soft)] p-4 text-sm font-black text-[var(--color-success-strong)]">
            Sucursal creada correctamente. Ya aparece separada para pedidos, caja, inventario y reportes.
          </div>
        ) : null}

        <Card className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-sm font-semibold text-[var(--color-secondary-text)]">Gestion de crecimiento</p>
            <h2 className="mt-1 text-2xl font-black">Todas tus sucursales</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-[var(--color-secondary-text)]">
              Cada sucursal mantiene su propia operacion. Como dueno puedes entrar a cualquiera sin crear otra sesion.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Badge className="justify-center bg-[var(--primary-light)] text-[var(--primary)]">
              {capacity.used}/{capacity.limit} en {capacity.planName}
            </Badge>
            {remaining > 0 ? (
              <Link className={buttonClasses("primary")} href="/dueno/sucursales/nueva">
                <Plus className="h-4 w-4" />
                Crear sucursal
              </Link>
            ) : (
              <Link className={buttonClasses("primary")} href="/dueno/soporte">
                Solicitar sucursal
              </Link>
            )}
          </div>
        </Card>

        <SectionTitle description="Accesos rapidos para revisar o entrar al panel operativo." title="Directorio interno" />

        <div className="grid gap-4 lg:grid-cols-2">
          {summaries.map((summary) => (
            <BranchSummaryCard key={summary.membership.restaurant.id} summary={summary} />
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {ownerMemberships.map((membership) => (
            <Card className="p-4" key={membership.restaurant.id}>
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--primary-light)] text-[var(--primary)]">
                <Building2 className="h-5 w-5" />
              </span>
              <p className="mt-3 truncate text-lg font-black">{membership.restaurant.name}</p>
              <p className="mt-1 truncate text-sm font-semibold text-[var(--color-secondary-text)]">{publicRestaurantPath(membership.restaurant.slug)}</p>
              <p className="mt-1 flex items-center gap-1 text-xs font-bold text-[var(--color-secondary-text)]">
                <MapPin className="h-3.5 w-3.5" />
                {membership.restaurant.city || "Sin ciudad"}
              </p>
              <div className="mt-4 flex gap-2">
                <Link className={buttonClasses("secondary", "flex-1")} href={`/admin/restaurantes/${membership.restaurant.id}/configuracion`}>
                  <ShieldCheck className="h-4 w-4" />
                  Config
                </Link>
                <Link className={buttonClasses("primary", "flex-1")} href={`/admin/restaurantes/${membership.restaurant.id}/dashboard`}>
                  Entrar
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </OwnerLayout>
  );
}
