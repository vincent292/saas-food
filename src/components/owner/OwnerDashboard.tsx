import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, BarChart3, Boxes, Building2, ClipboardList, PackageSearch, Plus, Store, TrendingUp, WalletCards } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";
import type { OwnerDashboardData, OwnerProductPerformance, OwnerBranchSummary } from "@/lib/services/owner-dashboard.service";
import { formatMoney } from "@/lib/utils/money";
import { publicRestaurantPath } from "@/lib/utils/public-routes";

export function OwnerDashboard({
  data,
  email,
}: {
  data: OwnerDashboardData;
  email: string;
}) {
  const remainingBranches = Math.max(0, data.capacity.limit - data.capacity.used);

  return (
    <div className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-stretch">
        <Card className="overflow-hidden p-0">
          <div className="grid h-full gap-0 md:grid-cols-[1fr_220px]">
            <div className="p-5 sm:p-6">
              <p className="text-sm font-semibold text-[var(--color-secondary-text)]">Vista ejecutiva</p>
              <h2 className="mt-1 text-2xl font-black sm:text-3xl">Tu negocio separado por sucursal</h2>
              <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-[var(--color-secondary-text)]">
                {email} - Tarifa {data.capacity.planName} - {remainingBranches} cupo{remainingBranches === 1 ? "" : "s"} disponible{remainingBranches === 1 ? "" : "s"}
              </p>
              <p className="mt-2 text-sm font-black text-[var(--color-heading)]">
                Estimado mensual: {formatMoney(data.capacity.monthlyTotal)} ({formatMoney(data.capacity.primaryPriceMonthly)} primera sucursal, {formatMoney(data.capacity.additionalPriceMonthly)} cada adicional)
              </p>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                {remainingBranches > 0 ? (
                  <Link className={buttonClasses("primary", "w-full sm:w-auto")} href="/dueno/sucursales/nueva">
                    <Plus className="h-4 w-4" />
                    Crear sucursal
                  </Link>
                ) : (
                  <Link className={buttonClasses("primary", "w-full sm:w-auto")} href="/dueno/soporte">
                    <Plus className="h-4 w-4" />
                    Solicitar cupo
                  </Link>
                )}
                <Link className={buttonClasses("secondary", "w-full sm:w-auto")} href="/dueno/sucursales">
                  Ver sucursales
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
            <div className="border-t border-[var(--border)] bg-[var(--primary)] p-5 text-white md:border-l md:border-t-0">
              <p className="text-xs font-black uppercase text-[var(--accent)]">Sucursales</p>
              <p className="mt-2 text-3xl font-black">{data.capacity.used}/{data.capacity.limit}</p>
              <p className="mt-1 text-sm font-bold text-white/72">sucursales activas</p>
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/14">
                <span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.min(100, (data.capacity.used / Math.max(1, data.capacity.limit)) * 100)}%` }} />
              </div>
            </div>
          </div>
        </Card>

        <Card className="bg-[var(--color-card-elevated)]">
          <div className="flex items-start gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--accent)] text-[var(--primary)]">
              <TrendingUp className="h-5 w-5" />
            </span>
            <div>
              <p className="text-lg font-black">Actividad actual</p>
              <p className="mt-2 text-3xl font-black">{data.totals.activeOrders}</p>
              <p className="text-sm font-semibold text-[var(--color-secondary-text)]">pedidos activos entre todas las sucursales</p>
            </div>
          </div>
        </Card>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <OwnerMetric icon={<Store className="h-5 w-5" />} label="Sucursales" value={String(data.summaries.length)} />
        <OwnerMetric icon={<ClipboardList className="h-5 w-5" />} label="Pedidos 30d" value={String(data.totals.orders30d)} />
        <OwnerMetric icon={<WalletCards className="h-5 w-5" />} label="Ventas 30d" value={formatMoney(data.totals.revenue30d)} />
        <OwnerMetric icon={<BarChart3 className="h-5 w-5" />} label="Ticket promedio" value={data.totals.averageTicket} />
        <OwnerMetric icon={<Boxes className="h-5 w-5" />} label="Alertas inventario" value={String(data.totals.inventoryAlerts)} />
      </div>

      <SectionTitle description="Resumen de ventas y productos en los ultimos 30 dias." title="Rendimiento" />

      <div className="grid gap-4 lg:grid-cols-2">
        <ProductPerformanceCard icon={<BarChart3 className="h-5 w-5" />} items={data.performance.topProducts} title="Mas vendido" />
        <ProductPerformanceCard icon={<PackageSearch className="h-5 w-5" />} items={data.performance.lowProducts} title="Menos vendido" />
      </div>

      <SectionTitle description="Pedidos, caja, inventario y configuracion se mantienen separados por sucursal." title="Operacion por sucursal" />

      <div className="grid gap-4 lg:grid-cols-2">
        {data.summaries.map((summary) => (
          <BranchSummaryCard key={summary.membership.restaurant.id} summary={summary} />
        ))}
      </div>
    </div>
  );
}

export function BranchSummaryCard({ summary }: { summary: OwnerBranchSummary }) {
  const { restaurant } = summary.membership;

  return (
    <Card className="flex h-full flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xl font-black">{restaurant.name}</p>
          <p className="mt-1 text-sm font-semibold text-[var(--color-secondary-text)]">
            {publicRestaurantPath(restaurant.slug)}
            {restaurant.city ? ` - ${restaurant.city}` : ""}
          </p>
          <Badge className="mt-3 bg-[var(--primary-light)] text-[var(--primary)]">Sucursal independiente</Badge>
        </div>
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--primary)] text-[var(--color-on-primary)]">
          <Building2 className="h-5 w-5" />
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <MiniMetric label="Ventas 30d" value={formatMoney(summary.revenue30d)} />
        <MiniMetric label="Pedidos hoy" value={String(summary.ordersToday)} />
        <MiniMetric label="Pedidos activos" value={String(summary.activeOrders)} />
        <MiniMetric label="Caja" value={summary.openCashSession ? "Abierta" : summary.lastClosedCashAt ? "Cerrada" : "Sin cierre"} />
        <MiniMetric label="Bajo stock" tone={summary.lowStockItems ? "warning" : "default"} value={String(summary.lowStockItems)} />
        <MiniMetric label="Vence pronto" tone={summary.expiringLots ? "warning" : "default"} value={String(summary.expiringLots)} />
      </div>

      <div className="mt-auto flex flex-col gap-2 sm:flex-row">
        <Link className={buttonClasses("primary", "flex-1")} href={`/admin/restaurantes/${restaurant.id}/dashboard`}>
          Operar
          <ArrowRight className="h-4 w-4" />
        </Link>
        <Link className={buttonClasses("secondary", "flex-1")} href={`/admin/restaurantes/${restaurant.id}/pedidos`}>
          Pedidos
        </Link>
        <Link className={buttonClasses("secondary", "flex-1")} href={`/admin/restaurantes/${restaurant.id}/inventario`}>
          Inventario
        </Link>
      </div>
    </Card>
  );
}

export function ProductPerformanceCard({ icon, items, title }: { icon: ReactNode; items: OwnerProductPerformance[]; title: string }) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--primary-light)] text-[var(--primary)]">{icon}</span>
        <div>
          <p className="text-lg font-black text-[var(--color-heading)]">{title}</p>
          <p className="text-sm font-semibold text-[var(--color-secondary-text)]">Productos vendidos por sucursal</p>
        </div>
      </div>
      <div className="mt-4 grid gap-2">
        {items.length ? (
          items.map((item, index) => (
            <div className="grid gap-2 rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-3 sm:grid-cols-[auto_1fr_auto] sm:items-center" key={`${item.branchName}-${item.productName}`}>
              <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--accent)] text-sm font-black text-[var(--primary)]">{index + 1}</span>
              <div className="min-w-0">
                <p className="truncate font-black text-[var(--color-heading)]">{item.productName}</p>
                <p className="truncate text-xs font-semibold text-[var(--color-secondary-text)]">{item.branchName}</p>
              </div>
              <div className="text-left sm:text-right">
                <p className="text-sm font-black text-[var(--color-heading)]">{item.quantity} vendidos</p>
                <p className="text-xs font-semibold text-[var(--color-secondary-text)]">{formatMoney(item.revenue)}</p>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--color-surface)] p-4 text-sm font-semibold text-[var(--color-secondary-text)]">
            Todavia no hay ventas suficientes para mostrar este reporte.
          </div>
        )}
      </div>
    </Card>
  );
}

function OwnerMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
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

function MiniMetric({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warning" }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-3">
      <p className="text-xs font-black uppercase text-[var(--color-secondary-text)]">{label}</p>
      <p className={tone === "warning" ? "mt-1 text-lg font-black text-[var(--color-warning-strong)]" : "mt-1 text-lg font-black text-[var(--color-heading)]"}>{value}</p>
    </div>
  );
}
