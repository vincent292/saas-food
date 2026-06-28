import Link from "next/link";
import { ClipboardList, Store, WalletCards } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { StatCard } from "@/components/ui/StatCard";
import { superadminService } from "@/lib/services/superadmin.service";
import { formatShortDate } from "@/lib/utils/dates";
import { formatMoney } from "@/lib/utils/money";

export default async function ReportsPage() {
  const reports = await superadminService.getReports();

  return (
    <AdminLayout active="/admin/reportes" title="Reportes">
      <div className="space-y-6">
        <SectionTitle description="Lectura global de los últimos 30 días." title="Reportes de uso y ventas" />
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard icon={<ClipboardList className="h-5 w-5" />} label="Pedidos" value={String(reports.totalOrders)} detail={`${reports.paidOrders} pagados`} />
          <StatCard icon={<WalletCards className="h-5 w-5" />} label="Ventas" value={formatMoney(reports.totalRevenue)} detail={`Ticket ${formatMoney(reports.averageTicket)}`} />
          <StatCard icon={<Store className="h-5 w-5" />} label="Cancelados" value={String(reports.cancelledOrders)} detail="Pedidos anulados" />
        </div>

        <section className="space-y-3">
          <SectionTitle title="Restaurantes por pedidos" />
          <DataTable
            emptyMessage="Sin pedidos en el periodo."
            headers={["Restaurante", "Pedidos", "Ventas", "Último pedido", "Acción"]}
            rows={reports.restaurantsWithOrders
              .filter((restaurant) => restaurant.orders30d > 0)
              .map((restaurant) => [
                restaurant.name,
                restaurant.orders30d,
                formatMoney(restaurant.revenue30d),
                restaurant.lastOrderAt ? formatShortDate(restaurant.lastOrderAt) : "Sin pedidos",
                <Link className={buttonClasses("secondary")} href={`/admin/restaurantes/${restaurant.id}`} key={restaurant.id}>
                  Ver ficha
                </Link>,
              ])}
          />
        </section>

        <div className="grid gap-6 lg:grid-cols-3">
          <MetricList title="Estados de pedido" values={reports.orderStatusCounts} />
          <MetricList title="Métodos de pago" values={reports.paymentMethodRevenue} money />
          <MetricList title="Uso de módulos" values={reports.moduleUsage} />
        </div>
      </div>
    </AdminLayout>
  );
}

function MetricList({ title, values, money = false }: { title: string; values: Record<string, number>; money?: boolean }) {
  const entries = Object.entries(values).sort(([, a], [, b]) => b - a);

  return (
    <Card>
      <h2 className="text-lg font-black">{title}</h2>
      <div className="mt-4 space-y-3">
        {entries.length ? (
          entries.map(([key, value]) => (
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2" key={key}>
              <span className="text-sm font-bold text-slate-700">{key}</span>
              <span className="text-sm font-black">{money ? formatMoney(value) : value}</span>
            </div>
          ))
        ) : (
          <p className="rounded-2xl bg-slate-50 p-3 text-sm font-semibold text-slate-500">Sin datos.</p>
        )}
      </div>
    </Card>
  );
}
