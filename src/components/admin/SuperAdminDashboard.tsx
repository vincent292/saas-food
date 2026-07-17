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
import { publicRestaurantPath } from "@/lib/utils/public-routes";

export async function SuperAdminDashboard() {
  const [summary, profile, directory, operations] = await Promise.all([
    superadminService.getDashboardSummary(),
    authService.getCurrentProfile(),
    publicDirectoryService.getDirectory(),
    superadminService.listRestaurantOperations(),
  ]);
  const presenceWatchlist = [...operations]
    .filter((restaurant) => restaurant.publicPresenceStatus !== "ready")
    .sort((left, right) => left.publicPresenceScore - right.publicPresenceScore)
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--color-secondary-text)]">Sesión administrativa</p>
          <p className="mt-1 text-xl font-black text-[var(--color-heading)]">{profile?.email ?? "Sin sesión activa"}</p>
        </div>
        <Badge className={profile?.globalRole === "superadmin" ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]" : "bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]"}>
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
            <ShieldCheck className="h-5 w-5 text-[var(--color-success-strong)]" />
            <div>
              <p className="text-sm font-bold text-[var(--color-secondary-text)]">Suspendidos</p>
              <p className="text-2xl font-black">{summary.suspendedRestaurantCount}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <ClipboardList className="h-5 w-5 text-[var(--color-warning-strong)]" />
            <div>
              <p className="text-sm font-bold text-[var(--color-secondary-text)]">Archivados</p>
              <p className="text-2xl font-black">{summary.archivedRestaurantCount}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <LockKeyhole className="h-5 w-5 text-[var(--color-body)]" />
            <div>
              <p className="text-sm font-bold text-[var(--color-secondary-text)]">Sesiones activas</p>
              <p className="text-2xl font-black">{summary.activeAccessSessions}</p>
            </div>
          </div>
        </Card>
      </div>

      <section className="space-y-3">
        <SectionTitle
          action={<Link className={buttonClasses("secondary")} href="/admin/restaurantes">Ver todos</Link>}
          description="Semaforo de tiendas publicas: identidad, catalogo, contacto y ubicacion antes de vender."
          title="Presencia publica"
        />
        <DataTable
          emptyMessage="Todas las tiendas activas tienen presencia publica lista."
          headers={["Restaurante", "Identidad", "Catalogo", "Ubicacion", "Estado", "Accion"]}
          rows={presenceWatchlist.map((restaurant) => [
            <div key={`${restaurant.id}-presence-name`}>
              <p className="font-black">{restaurant.name}</p>
              <p className="text-xs text-[var(--color-secondary-text)]">{publicRestaurantPath(restaurant.slug)}</p>
            </div>,
            <PresenceCell key={`${restaurant.id}-identity`} items={[restaurant.hasLogo ? "Logo" : "Sin logo", restaurant.hasBanner ? "Banner" : "Sin banner"]} ok={restaurant.hasLogo && restaurant.hasBanner} />,
            <PresenceCell key={`${restaurant.id}-catalog`} items={[`${restaurant.productCount} productos`, `${restaurant.categoryCount} categorias`]} ok={restaurant.productCount > 0 && restaurant.categoryCount > 0} />,
            <PresenceCell key={`${restaurant.id}-maps`} items={[restaurant.hasAddress ? "Direccion" : "Sin direccion", restaurant.hasMapsLocation ? "Maps listo" : "Google Maps pendiente"]} ok={restaurant.hasAddress && restaurant.hasMapsLocation} />,
            <PresenceStatus key={`${restaurant.id}-status`} score={restaurant.publicPresenceScore} status={restaurant.publicPresenceStatus} />,
            <Link className={buttonClasses("secondary")} href={`/admin/restaurantes/${restaurant.id}/configuracion`} key={`${restaurant.id}-action`}>
              Revisar
            </Link>,
          ])}
        />
      </section>

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
              <AdminRankRow href={publicRestaurantPath(item.restaurantSlug)} key={item.id} label={item.name} metric={`${item.orderCount} pedidos | ${item.restaurantName}`} rank={index + 1} />
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
              <p className="text-xs text-[var(--color-secondary-text)]">{publicRestaurantPath(restaurant.slug)}</p>
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

function PresenceCell({ items, ok }: { items: string[]; ok: boolean }) {
  return (
    <div className="space-y-1">
      {items.map((item) => (
        <p className={ok ? "text-xs font-bold text-[var(--color-success-strong)]" : "text-xs font-bold text-[var(--color-warning-strong)]"} key={item}>
          {item}
        </p>
      ))}
    </div>
  );
}

function PresenceStatus({ score, status }: { score: number; status: "ready" | "warning" | "critical" }) {
  const className =
    status === "ready"
      ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]"
      : status === "critical"
        ? "bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]"
        : "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]";

  return <Badge className={className}>{score}% listo</Badge>;
}

function AdminRankRow({ rank, label, metric, href }: { rank: number; label: string; metric: string; href: string }) {
  return (
    <Link className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl bg-[var(--color-surface)] p-2" href={href}>
      <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--surface)] text-xs font-black text-[var(--color-success-strong)]">{rank}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-black">{label}</span>
        <span className="block truncate text-xs font-semibold text-[var(--color-secondary-text)]">{metric}</span>
      </span>
      {rank === 1 ? <TrendingUp className="h-4 w-4 text-[var(--color-success-strong)]" /> : rank === 2 ? <Flame className="h-4 w-4 text-[var(--color-warning)]" /> : <Utensils className="h-4 w-4 text-[var(--color-placeholder)]" />}
    </Link>
  );
}
