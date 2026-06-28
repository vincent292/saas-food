import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { modulesForAdminLayout } from "@/lib/modules";
import { restaurantAccessService } from "@/lib/services/restaurant-access.service";
import { restaurantService } from "@/lib/services/restaurant.service";
import { superadminService } from "@/lib/services/superadmin.service";
import { formatShortDate, formatShortTime } from "@/lib/utils/dates";
import { formatMoney } from "@/lib/utils/money";

export default async function RestaurantOverviewPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const restaurant = await restaurantService.getById(restaurantId);

  if (!restaurant) {
    notFound();
  }

  await restaurantAccessService.claimOrRedirect(restaurant.id, `/admin/restaurantes/${restaurant.id}`);
  const control = await superadminService.getRestaurantControl(restaurant.id);

  if (!control) {
    notFound();
  }

  const paidOrders = control.orders.filter((order) => order.paymentStatus === "paid");

  return (
    <AdminLayout
      active="dashboard"
      enabledModules={modulesForAdminLayout(restaurant)}
      restaurantId={restaurant.id}
      restaurantName={restaurant.name}
      restaurantStatus={restaurant.status}
      title={restaurant.name}
    >
      <div className="space-y-6">
        <SectionTitle
          action={
            <div className="flex flex-wrap gap-2">
              <Link className={buttonClasses("secondary")} href={`/r/${restaurant.slug}`}>
                Ver menú
              </Link>
              <Link className={buttonClasses("secondary")} href={`/admin/restaurantes/${restaurant.id}/soporte`}>
                Soporte
              </Link>
              <Link className={buttonClasses("primary")} href={`/admin/restaurantes/${restaurant.id}/dashboard`}>
                Gestionar
              </Link>
            </div>
          }
          description="Ficha 360 para control operativo, soporte y seguimiento."
          title="Resumen del restaurante"
        />

        <div className="grid gap-4 md:grid-cols-4">
          <InfoCard label="Responsable" value={restaurant.ownerEmail || "Sin responsable"} />
          <InfoCard label="Plan" value={restaurant.planKey ?? "Sin plan"} />
          <InfoCard label="Módulos" value={String(restaurant.activeModules?.length ?? 0)} />
          <InfoCard label="Ventas recientes" value={formatMoney(paidOrders.reduce((sum, order) => sum + order.total, 0))} />
        </div>

        <Card>
          <div className="grid gap-4 lg:grid-cols-3">
            <div>
              <p className="text-xs font-black uppercase text-slate-500">URL pública</p>
              <p className="mt-1 text-lg font-black">/r/{restaurant.slug}</p>
            </div>
            <div>
              <p className="text-xs font-black uppercase text-slate-500">Ciudad</p>
              <p className="mt-1 text-lg font-black">{restaurant.city || "Sin ciudad"}</p>
            </div>
            <div>
              <p className="text-xs font-black uppercase text-slate-500">Estado</p>
              <Badge className={restaurant.status === "active" ? "mt-1 bg-emerald-50 text-emerald-700" : "mt-1 bg-amber-50 text-amber-700"}>{restaurant.status}</Badge>
            </div>
          </div>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <section className="space-y-3">
            <SectionTitle title="Pedidos recientes" />
            <DataTable
              emptyMessage="Sin pedidos recientes."
              headers={["Pedido", "Cliente", "Estado", "Total", "Fecha"]}
              rows={control.orders.map((order) => [
                order.orderNumber,
                order.customerName || "Sin nombre",
                order.status,
                formatMoney(order.total),
                `${formatShortDate(order.createdAt)} ${formatShortTime(order.createdAt)}`,
              ])}
            />
          </section>

          <section className="space-y-3">
            <SectionTitle title="Cierres de caja" />
            <DataTable
              emptyMessage="Sin cierres de caja."
              headers={["Apertura", "Estado", "Ventas", "Diferencia"]}
              rows={control.cashReports.map((report) => [
                `${formatShortDate(report.session.openedAt)} ${formatShortTime(report.session.openedAt)}`,
                report.session.status,
                formatMoney(report.salesTotal),
                formatMoney(report.session.differenceAmount ?? 0),
              ])}
            />
          </section>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <section className="space-y-3">
            <SectionTitle title="Soporte e incidencias" />
            <DataTable
              emptyMessage="Sin soporte abierto para este restaurante."
              headers={["Tipo", "Detalle", "Estado"]}
              rows={[
                ...control.tickets.map((ticket) => ["Ticket", ticket.title, ticket.status]),
                ...control.incidents.map((incident) => ["Incidencia", incident.title, incident.status]),
              ]}
            />
          </section>

          <section className="space-y-3">
            <SectionTitle title="Acceso y usuarios" />
            <DataTable
              emptyMessage="Sin usuarios activos en este momento."
              headers={["Usuario", "Rol", "Última actividad"]}
              rows={control.accessSessions.map((session) => [
                session.userEmail || session.userName,
                session.role,
                `${formatShortDate(session.lastSeenAt)} ${formatShortTime(session.lastSeenAt)}`,
              ])}
            />
          </section>
        </div>

        <section className="space-y-3">
          <SectionTitle title="Inventario bajo mínimo" />
          <DataTable
            emptyMessage="Sin alertas de inventario."
            headers={["Insumo", "Stock", "Mínimo"]}
            rows={control.lowStock.map((item) => [item.name, `${item.currentStock} ${item.unit}`, `${item.minStock} ${item.unit}`])}
          />
        </section>
      </div>
    </AdminLayout>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <p className="text-sm font-bold text-slate-500">{label}</p>
      <p className="mt-1 truncate text-xl font-black text-slate-950">{value}</p>
    </Card>
  );
}
