import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Boxes,
  Building2,
  CircleDollarSign,
  ClipboardList,
  Lightbulb,
  PackageSearch,
  PieChart,
  Plus,
  ReceiptText,
  Store,
  TrendingUp,
  Users,
  WalletCards,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";
import type { OwnerDashboardData, OwnerProductPerformance, OwnerBranchSummary, OwnerBranchRevenueShare, OwnerDailySales } from "@/lib/services/owner-dashboard.service";
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

      <ExecutiveInsights data={data} />

      <SectionTitle description="Resumen de ventas y productos en los ultimos 30 dias." title="Rendimiento" />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <DailySalesChart items={data.analytics.dailySales} />
        <BranchShareDonut items={data.analytics.branchRevenueShare} totalRevenue={data.totals.revenue30d} />
      </div>

      <BranchRevenueChart items={data.analytics.branchRevenueShare} />

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

function ExecutiveInsights({ data }: { data: OwnerDashboardData }) {
  const { executive } = data;

  return (
    <section className="space-y-4">
      <SectionTitle
        description="Los 10 puntos clave que le ayudan al dueno a decidir sin entrar a cada modulo operativo."
        title="Panel 360 del dueno"
      />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <InsightCard
          detail={`Hoy ${formatMoney(executive.sales.revenueToday)} · 7d ${formatMoney(executive.sales.revenue7d)}`}
          icon={<WalletCards className="h-5 w-5" />}
          label="1. Ventas"
          tone={executive.sales.revenueDeltaPercent >= 0 ? "success" : "warning"}
          value={`${executive.sales.revenueDeltaPercent >= 0 ? "+" : ""}${executive.sales.revenueDeltaPercent}%`}
        />
        <InsightCard
          detail={`${executive.orders.cancelled30d} cancelados · ${executive.orders.activeOrders} activos`}
          icon={<ClipboardList className="h-5 w-5" />}
          label="2. Pedidos"
          tone={executive.orders.cancellationRate >= 10 ? "danger" : "info"}
          value={`${executive.orders.total30d} pedidos`}
        />
        <InsightCard
          detail={data.performance.lowProducts[0] ? `Baja rotacion: ${data.performance.lowProducts[0].productName}` : "Sin baja rotacion detectada"}
          icon={<PackageSearch className="h-5 w-5" />}
          label="3. Productos"
          value={data.performance.topProducts[0]?.productName ?? "Sin ventas"}
        />
        <InsightCard
          detail={`Costo est. ${formatMoney(executive.profitability.estimatedCost30d)} · margen ${executive.profitability.estimatedMarginPercent}%`}
          icon={<CircleDollarSign className="h-5 w-5" />}
          label="4. Rentabilidad"
          tone={executive.profitability.unconfiguredProductSales ? "warning" : "success"}
          value={formatMoney(executive.profitability.estimatedGrossProfit30d)}
        />
        <InsightCard
          detail={`${executive.inventory.expiringLots} lotes vencen pronto`}
          icon={<Boxes className="h-5 w-5" />}
          label="5. Inventario"
          tone={executive.inventory.lowStockItems || executive.inventory.expiringLots ? "warning" : "success"}
          value={`${executive.inventory.lowStockItems} bajo stock`}
        />
        <InsightCard
          detail={`Mirar: ${executive.branches.attentionBranchName}`}
          icon={<Store className="h-5 w-5" />}
          label="6. Sucursales"
          value={executive.branches.bestBranchName}
        />
        <InsightCard
          detail={`Recurrentes ${executive.customers.repeatCustomers30d} · top ${executive.customers.topCustomerName}`}
          icon={<Users className="h-5 w-5" />}
          label="7. Clientes"
          value={`${executive.customers.uniqueCustomers30d} clientes`}
        />
        <InsightCard
          detail={executive.alerts[0]?.detail ?? "Sin alertas fuertes"}
          icon={<AlertTriangle className="h-5 w-5" />}
          label="8. Alertas"
          tone={executive.alerts.some((alert) => alert.tone === "danger") ? "danger" : executive.alerts.length ? "warning" : "success"}
          value={`${executive.alerts.length} avisos`}
        />
        <InsightCard
          detail={`${executive.cash.branchesWithoutRecentClose} sucursales sin cierre reciente`}
          icon={<ReceiptText className="h-5 w-5" />}
          label="9. Caja"
          tone={executive.cash.openSessions ? "info" : "success"}
          value={`${executive.cash.openSessions} abiertas`}
        />
        <InsightCard
          detail={executive.recommendations[0]?.detail ?? "Aun sin datos suficientes"}
          icon={<Lightbulb className="h-5 w-5" />}
          label="10. Recomendaciones"
          tone="info"
          value={`${executive.recommendations.length} ideas`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <ChannelBreakdown items={executive.orders.channels} />
        <NoticeBoard alerts={executive.alerts} recommendations={executive.recommendations} />
      </div>
    </section>
  );
}

function InsightCard({
  detail,
  icon,
  label,
  tone = "info",
  value,
}: {
  detail: string;
  icon: ReactNode;
  label: string;
  tone?: "success" | "warning" | "danger" | "info";
  value: string;
}) {
  const toneClass =
    tone === "success"
      ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]"
      : tone === "warning"
        ? "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]"
        : tone === "danger"
          ? "bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]"
          : "bg-[var(--primary-light)] text-[var(--primary)]";

  return (
    <Card className="min-w-0 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[var(--color-secondary-text)]">{label}</p>
          <p className="mt-2 truncate text-lg font-black text-[var(--color-heading)]">{value}</p>
        </div>
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-control)] ${toneClass}`}>{icon}</span>
      </div>
      <p className="mt-3 line-clamp-2 text-xs font-semibold leading-5 text-[var(--color-secondary-text)]">{detail}</p>
    </Card>
  );
}

function ChannelBreakdown({ items }: { items: OwnerDashboardData["executive"]["orders"]["channels"] }) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-control)] bg-[var(--primary-light)] text-[var(--primary)]">
          <BarChart3 className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xl font-black text-[var(--color-heading)]">Canales de pedido</p>
          <p className="text-sm font-semibold text-[var(--color-secondary-text)]">Delivery, mesa, recojo y caja/POS.</p>
        </div>
      </div>
      <div className="mt-5 grid gap-3">
        {items.length ? (
          items.map((item) => (
            <div className="grid gap-2" key={item.label}>
              <div className="flex items-center justify-between gap-3 text-sm font-black">
                <span>{item.label}</span>
                <span className="text-[var(--primary)]">{item.percentage}% · {item.count}</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-[var(--color-surface)] shadow-inner">
                <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.max(4, item.percentage)}%` }} />
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-[var(--radius-control)] bg-[var(--color-surface)] p-4 text-sm font-semibold text-[var(--color-secondary-text)]">Todavia no hay pedidos por canal.</p>
        )}
      </div>
    </Card>
  );
}

function NoticeBoard({
  alerts,
  recommendations,
}: {
  alerts: OwnerDashboardData["executive"]["alerts"];
  recommendations: OwnerDashboardData["executive"]["recommendations"];
}) {
  return (
    <Card>
      <div className="grid gap-4 md:grid-cols-2">
        <NoticeColumn icon={<AlertTriangle className="h-5 w-5" />} items={alerts} title="Alertas inteligentes" />
        <NoticeColumn icon={<Lightbulb className="h-5 w-5" />} items={recommendations} title="Recomendaciones" />
      </div>
    </Card>
  );
}

function NoticeColumn({ icon, items, title }: { icon: ReactNode; items: OwnerDashboardData["executive"]["alerts"]; title: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span className="text-[var(--primary)]">{icon}</span>
        <p className="font-black text-[var(--color-heading)]">{title}</p>
      </div>
      <div className="mt-3 grid gap-2">
        {items.length ? (
          items.slice(0, 4).map((item) => (
            <div className="rounded-[var(--radius-control)] bg-[var(--color-surface)] p-3" key={`${title}-${item.title}`}>
              <p className="text-sm font-black text-[var(--color-heading)]">{item.title}</p>
              <p className="mt-1 text-xs font-semibold leading-5 text-[var(--color-secondary-text)]">{item.detail}</p>
            </div>
          ))
        ) : (
          <p className="rounded-[var(--radius-control)] bg-[var(--color-surface)] p-3 text-sm font-semibold text-[var(--color-secondary-text)]">Sin avisos por ahora.</p>
        )}
      </div>
    </div>
  );
}

function DailySalesChart({ items }: { items: OwnerDailySales[] }) {
  const maxRevenue = Math.max(1, ...items.map((item) => item.revenue));
  const bestDay = [...items].sort((left, right) => right.revenue - left.revenue)[0];

  return (
    <Card>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--primary)]">Grafico</p>
          <h3 className="mt-1 text-xl font-black text-[var(--color-heading)]">Ventas ultimos 7 dias</h3>
          <p className="mt-1 text-sm font-semibold text-[var(--color-secondary-text)]">Barras por ingresos diarios entre todas las sucursales.</p>
        </div>
        <Badge className="w-fit bg-[var(--accent)] text-[var(--primary)]">
          Mejor dia: {bestDay?.label ?? "Sin datos"}
        </Badge>
      </div>

      <div className="mt-6 flex h-56 items-end gap-2 rounded-[var(--radius-card)] bg-[var(--color-surface)] p-4 sm:gap-3">
        {items.map((item) => {
          const height = Math.max(8, Math.round((item.revenue / maxRevenue) * 100));

          return (
            <div className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2" key={item.date}>
              <div className="flex h-40 w-full items-end rounded-full bg-white shadow-inner">
                <div
                  className="w-full rounded-full bg-[linear-gradient(180deg,var(--accent)_0%,#8fb300_100%)] shadow-[0_10px_22px_rgb(199_240_0_/_0.25)]"
                  style={{ height: `${height}%` }}
                  title={`${item.label}: ${formatMoney(item.revenue)} (${item.orders} pedidos)`}
                />
              </div>
              <span className="truncate text-[11px] font-black text-[var(--color-secondary-text)]">{item.label}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function BranchShareDonut({ items, totalRevenue }: { items: OwnerBranchRevenueShare[]; totalRevenue: number }) {
  const colors = ["#c7f000", "#5e8daf", "#f59e0b", "#22c55e", "#3b82f6", "#ef4444"];
  let cursor = 0;
  const gradient =
    totalRevenue > 0 && items.length
      ? items
          .map((item, index) => {
            const start = cursor;
            const size = (item.revenue / totalRevenue) * 100;
            cursor += size;
            return `${colors[index % colors.length]} ${start}% ${cursor}%`;
          })
          .join(", ")
      : "#e5e7eb 0% 100%";

  return (
    <Card>
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-control)] bg-[var(--primary-light)] text-[var(--primary)]">
          <PieChart className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xl font-black text-[var(--color-heading)]">Participacion por sucursal</p>
          <p className="text-sm font-semibold text-[var(--color-secondary-text)]">Que sucursal pesa mas en ventas.</p>
        </div>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-[180px_1fr] sm:items-center">
        <div className="relative mx-auto h-44 w-44 rounded-full" style={{ background: `conic-gradient(${gradient})` }}>
          <div className="absolute inset-6 grid place-items-center rounded-full bg-[var(--surface)] text-center shadow-inner">
            <span>
              <span className="block text-xs font-black uppercase text-[var(--color-secondary-text)]">Total</span>
              <span className="block text-lg font-black text-[var(--color-heading)]">{formatMoney(totalRevenue)}</span>
            </span>
          </div>
        </div>
        <div className="grid gap-2">
          {items.length ? (
            items.slice(0, 6).map((item, index) => (
              <div className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] bg-[var(--color-surface)] p-3" key={item.branchName}>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
                  <span className="truncate text-sm font-black text-[var(--color-heading)]">{item.branchName}</span>
                </span>
                <span className="text-sm font-black text-[var(--primary)]">{item.percentage}%</span>
              </div>
            ))
          ) : (
            <p className="rounded-[var(--radius-control)] bg-[var(--color-surface)] p-4 text-sm font-semibold text-[var(--color-secondary-text)]">Sin ventas para comparar todavia.</p>
          )}
        </div>
      </div>
    </Card>
  );
}

function BranchRevenueChart({ items }: { items: OwnerBranchRevenueShare[] }) {
  const maxRevenue = Math.max(1, ...items.map((item) => item.revenue));

  return (
    <Card>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--primary)]">Comparativa</p>
          <h3 className="mt-1 text-xl font-black text-[var(--color-heading)]">Ventas por sucursal</h3>
          <p className="mt-1 text-sm font-semibold text-[var(--color-secondary-text)]">Ayuda a detectar que sucursal empuja mas y cual necesita atencion.</p>
        </div>
        <Badge className="w-fit bg-[var(--primary-light)] text-[var(--primary)]">{items.length} sucursal{items.length === 1 ? "" : "es"}</Badge>
      </div>

      <div className="mt-5 grid gap-3">
        {items.length ? (
          items.map((item, index) => (
            <div className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)_120px] sm:items-center" key={item.branchName}>
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-[var(--color-heading)]">{index + 1}. {item.branchName}</p>
                <p className="text-xs font-semibold text-[var(--color-secondary-text)]">{item.orders} pedidos</p>
              </div>
              <div className="h-4 overflow-hidden rounded-full bg-[var(--color-surface)] shadow-inner">
                <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${Math.max(4, (item.revenue / maxRevenue) * 100)}%` }} />
              </div>
              <p className="text-sm font-black text-[var(--primary)] sm:text-right">{formatMoney(item.revenue)}</p>
            </div>
          ))
        ) : (
          <p className="rounded-[var(--radius-control)] bg-[var(--color-surface)] p-4 text-sm font-semibold text-[var(--color-secondary-text)]">Todavia no hay ventas registradas.</p>
        )}
      </div>
    </Card>
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
