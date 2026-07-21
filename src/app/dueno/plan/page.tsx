import Link from "next/link";
import { Plus, WalletCards } from "lucide-react";
import { OwnerLayout, getOwnerLayoutContext } from "@/components/layout/OwnerLayout";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { getOwnerBranchCapacity } from "@/lib/services/owner-dashboard.service";

export default async function OwnerPlanPage() {
  const { ownerMemberships } = await getOwnerLayoutContext();
  const capacity = await getOwnerBranchCapacity(ownerMemberships);
  const remaining = Math.max(0, capacity.limit - capacity.used);

  return (
    <OwnerLayout active="/dueno/plan" memberships={ownerMemberships} title="Tarifa">
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--primary-light)] text-[var(--primary)]">
            <WalletCards className="h-5 w-5" />
          </span>
          <h2 className="mt-4 text-2xl font-black">Tarifa {capacity.planName}</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-[var(--color-secondary-text)]">
            Todo incluido para cada sucursal activa: pedidos, cocina, caja, inventario, reportes, soporte y configuracion. La habilitacion de cupos la maneja el superadmin del SaaS.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <PriceMetric label="Primera sucursal" value={`Bs ${capacity.primaryPriceMonthly}`} />
            <PriceMetric label="Sucursal adicional" value={`Bs ${capacity.additionalPriceMonthly}`} />
            <PriceMetric label="Total estimado" value={`Bs ${capacity.monthlyTotal}`} />
          </div>
          <div className="mt-5 h-3 overflow-hidden rounded-full bg-[var(--primary-light)]">
            <span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.min(100, (capacity.used / Math.max(1, capacity.limit)) * 100)}%` }} />
          </div>
        </Card>

        <Card className="flex flex-col justify-between gap-5">
          <div>
            <Badge className="bg-[var(--primary-light)] text-[var(--primary)]">Capacidad</Badge>
            <p className="mt-4 text-4xl font-black">{capacity.used}/{capacity.limit}</p>
            <p className="mt-1 text-sm font-semibold text-[var(--color-secondary-text)]">
              {remaining} cupo{remaining === 1 ? "" : "s"} disponible{remaining === 1 ? "" : "s"}
            </p>
          </div>
          {remaining > 0 ? (
            <Link className={buttonClasses("primary")} href="/dueno/sucursales/nueva">
              <Plus className="h-4 w-4" />
              Crear sucursal
            </Link>
          ) : (
            <Link className={buttonClasses("primary")} href="/dueno/soporte">
              Solicitar otro cupo
            </Link>
          )}
        </Card>
      </div>
    </OwnerLayout>
  );
}

function PriceMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-4">
      <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-xl font-black text-[var(--color-heading)]">{value}</p>
      <p className="text-xs font-bold text-[var(--color-secondary-text)]">mensual</p>
    </div>
  );
}
