import Link from "next/link";
import { ArrowRight, Boxes, CalendarClock, PackageSearch } from "lucide-react";
import type { ReactNode } from "react";
import { OwnerLayout, getOwnerLayoutContext } from "@/components/layout/OwnerLayout";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { getOwnerBranchSummaries } from "@/lib/services/owner-dashboard.service";

export default async function OwnerInventoryPage() {
  const { ownerMemberships } = await getOwnerLayoutContext({ active: "/dueno/inventario" });
  const summaries = await getOwnerBranchSummaries(ownerMemberships);
  const totalLowStock = summaries.reduce((sum, summary) => sum + summary.lowStockItems, 0);
  const totalExpiring = summaries.reduce((sum, summary) => sum + summary.expiringLots, 0);

  return (
    <OwnerLayout active="/dueno/inventario" memberships={ownerMemberships} title="Inventario general">
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <InventoryMetric icon={<Boxes className="h-5 w-5" />} label="Sucursales" value={String(summaries.length)} />
          <InventoryMetric icon={<PackageSearch className="h-5 w-5" />} label="Bajo stock" value={String(totalLowStock)} />
          <InventoryMetric icon={<CalendarClock className="h-5 w-5" />} label="Vence pronto" value={String(totalExpiring)} />
        </div>

        <SectionTitle description="Vista consolidada para detectar problemas. El ajuste de stock se hace dentro de cada sucursal." title="Alertas por sucursal" />

        <div className="grid gap-3">
          {summaries.map((summary) => (
            <Card className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center" key={summary.membership.restaurant.id}>
              <div>
                <p className="text-lg font-black">{summary.membership.restaurant.name}</p>
                <p className="mt-1 text-sm font-semibold text-[var(--color-secondary-text)]">
                  {summary.lowStockItems} bajo stock - {summary.expiringLots} vencen pronto
                </p>
              </div>
              <Link className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[var(--primary)] px-4 text-sm font-black text-[var(--color-on-primary)]" href={`/admin/restaurantes/${summary.membership.restaurant.id}/inventario`}>
                Ver inventario
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Card>
          ))}
        </div>
      </div>
    </OwnerLayout>
  );
}

function InventoryMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-[var(--color-secondary-text)]">{label}</p>
          <p className="mt-1 text-2xl font-black text-[var(--color-heading)]">{value}</p>
        </div>
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--primary-light)] text-[var(--primary)]">{icon}</span>
      </div>
    </Card>
  );
}
