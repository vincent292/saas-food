import Link from "next/link";
import { AlertTriangle, Building2, ClipboardList, Flame, LifeBuoy, LockKeyhole, ShieldCheck, TrendingUp, Utensils, WalletCards } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { StatCard } from "@/components/ui/StatCard";
import { authService } from "@/lib/services/auth.service";
import { publicDirectoryService } from "@/lib/services/public-directory.service";
import { superadminService } from "@/lib/services/superadmin.service";
import { formatShortDate, formatShortTime } from "@/lib/utils/dates";
import { formatMoney } from "@/lib/utils/money";

export async function SuperAdminDashboard() {
  const [summary, profile, directory] = await Promise.all([superadminService.getDashboardSummary(), authService.getCurrentProfile(), publicDirectoryService.getDirectory()]);

  return (
    <div className="space-y-6">
      <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-500">Sesión administrativa</p>
          <p className="mt-1 text-xl font-black text-slate-950">{profile?.email ?? "Sin sesión activa"}</p>
        </div>
        <Badge className={profile?.globalRole === "superadmin" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}>
          {profile?.globalRole === "superadmin" ? "Superadmin" : "Sin rol superadmin"}
        </Badge>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<Building2 className="h-5 w-5" />} label="Restaurantes" value={String(summary.restaurantCount)} detail={`${summary.activeRestaurantCount} activos`} />
        <StatCard icon={<WalletCards className="h-5 w-5" />} label="Ventas de hoy" value={formatMoney(summary.todayRevenue)} detail={`${summary.todayOrders} pedidos`} />
        <StatCard icon={<LifeBuoy className="h-5 w-5" />} label="Soporte abierto" value={String(summary.openSupportTickets)} detail={`${summary.urgentTickets.length} urgentes`} />
        <StatCard icon={<AlertTriangle className="h-5 w-5" />} label="Incidencias" value={String(summary.openIncidents)} detail="Activas en plataforma" />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-emerald-700" />
            <div>
              <p className="text-sm font-bold text-slate-500">Suspendidos</p>
              <p className="text-2xl font-black">{summary.suspendedRestaurantCount}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <ClipboardList className="h-5 w-5 text-amber-700" />
            <div>
              <p className="text-sm font-bold text-slate-500">Archivados</p>
              <p className="text-2xl font-black">{summary.archivedRestaurantCount}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <LockKeyhole className="h-5 w-5 text-slate-700" />
            <div>
              <p className="text-sm font-bold text-slate-500">Sesiones activas</p>
              <p className="text-2xl font-black">{summary.activeAccessSessions}</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <SectionTitle title="Mas visitados" description="Visitas publicas de los ultimos 7 dias." />
          <div className="mt-4 space-y-2">
            {directory.mostVisited.slice(0, 5).map((item, index) => (
              <AdminRankRow href={`/admin/restaurantes/${item.restaurant.id}`} key={item.restaurant.id} label={item.restaurant.name} metric={`${item.visits7d} visitas`} rank={index + 1} />
            ))}
          </div>
        </Card>
        <Card>
          <SectionTitle title="Mas pedidos" description="Restaurantes por pedidos de los ultimos 30 dias." />
          <div className="mt-4 space-y-2">
            {directory.mostOrderedRestaurants.slice(0, 5).map((item, index) => (
              <AdminRankRow href={`/admin/restaurantes/${item.restaurant.id}`} key={item.restaurant.id} label={item.restaurant.name} metric={`${item.orders30d} pedidos`} rank={index + 1} />
            ))}
          </div>
        </Card>
        <Card>
          <SectionTitle title="Platos top" description="Productos con mas pedidos acumulados." />
          <div className="mt-4 space-y-2">
            {directory.mostOrderedDishes.slice(0, 5).map((item, index) => (
              <AdminRankRow href={`/r/${item.restaurantSlug}`} key={item.id} label={item.name} metric={`${item.orderCount} pedidos | ${item.restaurantName}`} rank={index + 1} />
            ))}
          </div>
        </Card>
      </div>

      <section className="space-y-3">
        <SectionTitle
          action={<Link className={buttonClasses("secondary")} href="/admin/reportes">Ver reportes</Link>}
          description="Ranking por actividad de los últimos 30 días."
          title="Restaurantes con más uso"
        />
        <DataTable
          emptyMessage="Todavía no hay actividad registrada."
          headers={["Restaurante", "Pedidos 30d", "Ventas 30d", "Último pedido", "Acción"]}
          rows={summary.topRestaurants.map((restaurant) => [
            <div key={`${restaurant.id}-name`}>
              <p className="font-black">{restaurant.name}</p>
              <p className="text-xs text-slate-500">/r/{restaurant.slug}</p>
            </div>,
            restaurant.orders30d,
            formatMoney(restaurant.revenue30d),
            restaurant.lastOrderAt ? `${formatShortDate(restaurant.lastOrderAt)} ${formatShortTime(restaurant.lastOrderAt)}` : "Sin pedidos",
            <Link className={buttonClasses("secondary")} href={`/admin/restaurantes/${restaurant.id}`} key={restaurant.id}>
              Ver ficha
            </Link>,
          ])}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <SectionTitle title="Tickets urgentes" />
          <DataTable
            emptyMessage="Sin tickets urgentes abiertos."
            headers={["Ticket", "Restaurante", "Estado"]}
            rows={summary.urgentTickets.map((ticket) => [ticket.title, ticket.restaurantName, ticket.status])}
          />
        </section>

        <section className="space-y-3">
          <SectionTitle title="Incidencias activas" />
          <DataTable
            emptyMessage="Sin incidencias activas."
            headers={["Incidencia", "Área", "Severidad"]}
            rows={summary.activeIncidents.map((incident) => [incident.title, incident.impactArea, incident.severity])}
          />
        </section>
      </div>
    </div>
  );
}

function AdminRankRow({ rank, label, metric, href }: { rank: number; label: string; metric: string; href: string }) {
  return (
    <Link className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl bg-slate-50 p-2" href={href}>
      <span className="grid h-8 w-8 place-items-center rounded-full bg-white text-xs font-black text-emerald-700">{rank}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-black">{label}</span>
        <span className="block truncate text-xs font-semibold text-slate-500">{metric}</span>
      </span>
      {rank === 1 ? <TrendingUp className="h-4 w-4 text-emerald-700" /> : rank === 2 ? <Flame className="h-4 w-4 text-amber-600" /> : <Utensils className="h-4 w-4 text-slate-400" />}
    </Link>
  );
}
