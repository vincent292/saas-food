import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";
import { BranchCreateFormClient } from "@/components/branches/BranchCreateFormClient";
import { OwnerLayout, getOwnerLayoutContext } from "@/components/layout/OwnerLayout";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { getOwnerBranchCapacity } from "@/lib/services/owner-dashboard.service";

export default async function NewOwnerBranchPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ error }, { ownerMemberships }] = await Promise.all([searchParams, getOwnerLayoutContext()]);

  if (!ownerMemberships.length) {
    redirect("/dueno");
  }

  const capacity = await getOwnerBranchCapacity(ownerMemberships);
  const remaining = Math.max(0, capacity.limit - capacity.used);

  return (
    <OwnerLayout active="/dueno/sucursales" memberships={ownerMemberships} title="Nueva sucursal">
      <div className="space-y-5 sm:space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link className={buttonClasses("secondary", "w-fit")} href="/dueno/sucursales">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Link>
          <Badge className={remaining > 0 ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]" : "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]"}>
            {remaining > 0 ? `${remaining} cupo${remaining === 1 ? "" : "s"} disponible${remaining === 1 ? "" : "s"}` : "Sin cupos disponibles"}
          </Badge>
        </div>

        <section className="overflow-hidden rounded-[1.75rem] bg-[linear-gradient(135deg,#082441_0%,#12355B_62%,#071E36_100%)] p-5 text-white shadow-[0_26px_70px_rgb(8_36_65_/_0.22)] sm:p-7 lg:p-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-black text-[var(--primary)] shadow-[var(--shadow-glow)]">
                <Sparkles className="h-3.5 w-3.5" />
                Nueva sucursal
              </span>
              <h1 className="mt-4 max-w-3xl text-3xl font-black leading-tight sm:text-4xl">Estas por crear una sucursal independiente</h1>
              <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-white/78 sm:text-base">
                Copiamos identidad, catalogo y configuracion desde una sucursal base. Luego esta nueva sucursal maneja su propio usuario, pedidos, caja e inventario.
              </p>
            </div>
            <div className="rounded-[1.35rem] border border-white/16 bg-white/10 p-4 backdrop-blur">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--accent)]">Tarifa actual</p>
              <p className="mt-2 text-2xl font-black">{capacity.planName}</p>
              <p className="mt-1 text-sm font-bold text-white/70">Sucursal adicional: Bs {capacity.additionalPriceMonthly}/mes</p>
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm font-black">
                <span className="rounded-2xl bg-white/12 p-3">
                  <span className="block text-white/62">Usadas</span>
                  {capacity.used}
                </span>
                <span className="rounded-2xl bg-white/12 p-3">
                  <span className="block text-white/62">Permitidas</span>
                  {capacity.limit}
                </span>
              </div>
            </div>
          </div>
        </section>

        {remaining > 0 ? (
          <BranchCreateFormClient ownerMemberships={ownerMemberships} serverError={error} />
        ) : (
          <Card className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <p className="text-xl font-black">No tienes cupos disponibles</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-[var(--color-secondary-text)]">
                Solicita a soporte que habilite otra sucursal en tu cuenta antes de crearla.
              </p>
            </div>
            <Link className={buttonClasses("primary")} href="/dueno/soporte">
              Solicitar cupo
            </Link>
          </Card>
        )}
      </div>
    </OwnerLayout>
  );
}
