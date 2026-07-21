import { BarChart3, Boxes, ClipboardList, WalletCards } from "lucide-react";
import type { ReactNode } from "react";
import { OwnerLayout, getOwnerLayoutContext } from "@/components/layout/OwnerLayout";
import { ProductPerformanceCard } from "@/components/owner/OwnerDashboard";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { getOwnerDashboardData } from "@/lib/services/owner-dashboard.service";
import { formatMoney } from "@/lib/utils/money";

export default async function OwnerReportsPage() {
  const { ownerMemberships } = await getOwnerLayoutContext();
  const data = await getOwnerDashboardData(ownerMemberships);

  return (
    <OwnerLayout active="/dueno/reportes" memberships={ownerMemberships} title="Ventas y pedidos">
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ReportMetric icon={<WalletCards className="h-5 w-5" />} label="Ventas 30d" value={formatMoney(data.totals.revenue30d)} />
          <ReportMetric icon={<ClipboardList className="h-5 w-5" />} label="Pedidos 30d" value={String(data.totals.orders30d)} />
          <ReportMetric icon={<BarChart3 className="h-5 w-5" />} label="Ticket promedio" value={data.totals.averageTicket} />
          <ReportMetric icon={<Boxes className="h-5 w-5" />} label="Alertas inventario" value={String(data.totals.inventoryAlerts)} />
        </div>

        <SectionTitle description="Comparativa consolidada sin mezclar la operacion diaria de cada sucursal." title="Rendimiento por producto" />

        <div className="grid gap-4 lg:grid-cols-2">
          <ProductPerformanceCard icon={<BarChart3 className="h-5 w-5" />} items={data.performance.topProducts} title="Mas vendido" />
          <ProductPerformanceCard icon={<BarChart3 className="h-5 w-5" />} items={data.performance.lowProducts} title="Menos vendido" />
        </div>

        <SectionTitle description="Lectura rapida de ventas y pedidos por sucursal." title="Resumen por sucursal" />

        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
          <div className="grid min-w-[760px] grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr_0.8fr] bg-[var(--color-neutral-100)] px-4 py-3 text-xs font-black uppercase text-[var(--color-secondary-text)]">
            <span>Sucursal</span>
            <span>Ventas 30d</span>
            <span>Pedidos 30d</span>
            <span>Pedidos hoy</span>
            <span>Activos</span>
          </div>
          <div className="overflow-x-auto">
            {data.summaries.map((summary) => (
              <div className="grid min-w-[760px] grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr_0.8fr] border-t border-[var(--border)] px-4 py-3 text-sm font-bold" key={summary.membership.restaurant.id}>
                <span className="truncate">{summary.membership.restaurant.name}</span>
                <span>{formatMoney(summary.revenue30d)}</span>
                <span>{summary.orders30d}</span>
                <span>{summary.ordersToday}</span>
                <span>{summary.activeOrders}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </OwnerLayout>
  );
}

function ReportMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-[var(--color-secondary-text)]">{label}</p>
          <p className="mt-1 text-2xl font-black text-[var(--color-heading)]">{value}</p>
        </div>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--primary-light)] text-[var(--primary)]">{icon}</span>
      </div>
    </Card>
  );
}
