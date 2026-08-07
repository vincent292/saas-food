import { AlertTriangle, BarChart3, Boxes, ClipboardList, Store, TrendingUp, Users, WalletCards } from "lucide-react";
import type { ReactNode } from "react";
import { OwnerLayout, getOwnerLayoutContext } from "@/components/layout/OwnerLayout";
import { ProductPerformanceCard } from "@/components/owner/OwnerDashboard";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { getOwnerDashboardData, type OwnerDashboardData, type OwnerExecutiveNotice } from "@/lib/services/owner-dashboard.service";
import { cn } from "@/lib/utils/cn";
import { formatMoney } from "@/lib/utils/money";

export default async function OwnerReportsPage() {
  const { ownerMemberships } = await getOwnerLayoutContext({ active: "/dueno/reportes" });
  const data = await getOwnerDashboardData(ownerMemberships);

  return (
    <OwnerLayout active="/dueno/reportes" memberships={ownerMemberships} title="Ventas y pedidos">
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ReportMetric icon={<WalletCards className="h-5 w-5" />} label="Cobrado 30d" value={formatMoney(data.totals.revenue30d)} />
          <ReportMetric icon={<ClipboardList className="h-5 w-5" />} label="Pedidos 30d" value={String(data.totals.orders30d)} />
          <ReportMetric icon={<BarChart3 className="h-5 w-5" />} label="Ticket promedio" value={data.totals.averageTicket} />
          <ReportMetric icon={<Boxes className="h-5 w-5" />} label="Alertas inventario" value={String(data.totals.inventoryAlerts)} />
          <ReportMetric icon={<Users className="h-5 w-5" />} label="Clientes 30d" value={String(data.executive.customers.uniqueCustomers30d)} />
          <ReportMetric icon={<TrendingUp className="h-5 w-5" />} label="Margen estimado" value={`${data.executive.profitability.estimatedMarginPercent}%`} />
          <ReportMetric icon={<AlertTriangle className="h-5 w-5" />} label="Cancelados 30d" value={String(data.executive.orders.cancelled30d)} />
          <ReportMetric icon={<Store className="h-5 w-5" />} label="Sucursal top" value={data.executive.branches.bestBranchName} />
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.75fr)]">
          <Card>
            <SectionTitle description="Sirve para saber por donde entran los pedidos y donde conviene optimizar primero." title="Canales de pedido" />
            <div className="mt-4 grid gap-3">
              {data.executive.orders.channels.length ? data.executive.orders.channels.map((channel) => (
                <ChannelRow channel={channel} key={channel.label} />
              )) : (
                <p className="rounded-2xl bg-[var(--color-surface)] p-4 text-sm font-bold text-[var(--muted)]">Aun no hay pedidos suficientes para comparar canales.</p>
              )}
            </div>
          </Card>

          <Card>
            <SectionTitle description="Lo que el dueño deberia revisar antes de cerrar decisiones del dia." title="Alertas ejecutivas" />
            <div className="mt-4 grid gap-3">
              {(data.executive.alerts.length ? data.executive.alerts : data.executive.recommendations.slice(0, 3)).map((notice) => (
                <NoticeItem key={`${notice.title}:${notice.detail}`} notice={notice} />
              ))}
            </div>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)]">
          <Card>
            <SectionTitle description="Clientes que vuelven, cliente mas activo y volumen real de la base." title="Clientes" />
            <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <SmallStat label="Unicos" value={String(data.executive.customers.uniqueCustomers30d)} />
              <SmallStat label="Repiten" value={String(data.executive.customers.repeatCustomers30d)} />
              <SmallStat label="Cliente top" value={`${data.executive.customers.topCustomerName} (${data.executive.customers.topCustomerOrders})`} />
            </div>
          </Card>

          <Card>
            <SectionTitle description="Ultimos 7 dias cobrados; ayuda a ver picos sin entrar sucursal por sucursal." title="Ventas por dia" />
            <div className="mt-4 grid gap-2">
              {data.analytics.dailySales.map((day) => (
                <DailySalesRow day={day} key={day.date} maxRevenue={Math.max(...data.analytics.dailySales.map((item) => item.revenue), 1)} />
              ))}
            </div>
          </Card>
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
            <span>Cobrado 30d</span>
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

function ChannelRow({ channel }: { channel: OwnerDashboardData["executive"]["orders"]["channels"][number] }) {
  return (
    <div className="rounded-2xl bg-[var(--color-surface)] p-3">
      <div className="flex items-center justify-between gap-3 text-sm font-black">
        <span>{channel.label}</span>
        <span className="text-[var(--primary)]">{channel.percentage}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--border)]">
        <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.max(4, channel.percentage)}%` }} />
      </div>
      <p className="mt-1 text-xs font-bold text-[var(--muted)]">{channel.count} pedidos</p>
    </div>
  );
}

function NoticeItem({ notice }: { notice: OwnerExecutiveNotice }) {
  const toneClassName =
    notice.tone === "danger"
      ? "bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]"
      : notice.tone === "warning"
        ? "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]"
        : notice.tone === "success"
          ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]"
          : "bg-[var(--color-info-soft)] text-[var(--color-info-strong)]";

  return (
    <div className={cn("rounded-2xl p-3", toneClassName)}>
      <p className="text-sm font-black">{notice.title}</p>
      <p className="mt-1 text-xs font-bold leading-5">{notice.detail}</p>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[var(--color-surface)] p-3">
      <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--muted)]">{label}</p>
      <p className="mt-1 truncate text-lg font-black text-[var(--text)]">{value}</p>
    </div>
  );
}

function DailySalesRow({ day, maxRevenue }: { day: OwnerDashboardData["analytics"]["dailySales"][number]; maxRevenue: number }) {
  const width = day.revenue ? Math.max(6, Math.round((day.revenue / maxRevenue) * 100)) : 0;

  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_6rem] items-center gap-3 rounded-2xl bg-[var(--color-surface)] p-3 text-sm font-bold">
      <span className="text-[var(--muted)]">{day.label}</span>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--border)]">
        <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${width}%` }} />
      </div>
      <span className="text-right font-black text-[var(--text)]">{formatMoney(day.revenue)}</span>
    </div>
  );
}
