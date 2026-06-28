import { LockOpen } from "lucide-react";
import { createSupportTicketAction, releaseAccessSessionByIdAction } from "@/app/admin/actions";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { SupportTicketList } from "@/components/support/SupportTicketList";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { restaurantService } from "@/lib/services/restaurant.service";
import { superadminService } from "@/lib/services/superadmin.service";
import { formatShortDate, formatShortTime } from "@/lib/utils/dates";

const priorityOptions = [
  { value: "low", label: "Baja" },
  { value: "medium", label: "Media" },
  { value: "high", label: "Alta" },
  { value: "urgent", label: "Urgente" },
] as const;

const messages: Record<string, string> = {
  ticket: "Ticket creado correctamente.",
  updated: "Ticket actualizado.",
  released: "Sesión liberada.",
  "invalid-ticket": "Revisa los datos del ticket.",
  "invalid-ticket-update": "No se pudo actualizar el ticket.",
  "invalid-attachment": "Los adjuntos deben ser imágenes de hasta 5 MB.",
  "restaurant-required": "Debes asociar el ticket a un restaurante o crearlo como plataforma desde superadmin.",
};

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ ticket?: string; updated?: string; released?: string; error?: string }>;
}) {
  const [params, tickets, restaurants, accessSessions] = await Promise.all([
    searchParams,
    superadminService.listSupportTickets(),
    restaurantService.listRestaurants(),
    superadminService.listAccessSessions("active"),
  ]);

  const openTickets = tickets.filter((ticket) => ["open", "in_progress", "waiting_customer"].includes(ticket.status));
  const urgentTickets = openTickets.filter((ticket) => ticket.priority === "urgent");
  const waitingCustomerTickets = tickets.filter((ticket) => ticket.status === "waiting_customer");
  const feedback = params.error ? messages[params.error] ?? `No se pudo completar la acción: ${params.error}.` : params.ticket ? messages.ticket : params.updated ? messages.updated : params.released ? messages.released : "";
  const feedbackTone = params.error ? "danger" : "success";

  return (
    <AdminLayout active="/admin/soporte" title="Soporte">
      <div className="space-y-6">
        <SectionTitle description="Casos de ayuda, screenshots, bloqueos de acceso y seguimiento operativo." title="Soporte" />

        {feedback ? <Banner tone={feedbackTone}>{feedback}</Banner> : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Tickets abiertos" value={String(openTickets.length)} />
          <MetricCard label="Urgentes" value={String(urgentTickets.length)} />
          <MetricCard label="Esperando cliente" value={String(waitingCustomerTickets.length)} />
          <MetricCard label="Sesiones activas" value={String(accessSessions.length)} />
        </div>

        <Card>
          <SectionTitle title="Nuevo ticket" description="Úsalo para registrar incidentes internos o casos operativos de un restaurante." />
          <form action={createSupportTicketAction} className="mt-4 grid gap-3 lg:grid-cols-2">
            <Select name="restaurantId">
              <option value="">Plataforma</option>
              {restaurants.map((restaurant) => (
                <option key={restaurant.id} value={restaurant.id}>
                  {restaurant.name}
                </option>
              ))}
            </Select>
            <Input name="title" placeholder="Título del caso" required />
            <Select name="category">
              <option value="access">Acceso</option>
              <option value="billing">Facturación</option>
              <option value="orders">Pedidos</option>
              <option value="cash">Caja</option>
              <option value="inventory">Inventario</option>
              <option value="incident">Incidencia</option>
              <option value="other">Otro</option>
            </Select>
            <Select defaultValue="medium" name="priority">
              {priorityOptions.map((priority) => (
                <option key={priority.value} value={priority.value}>
                  {priority.label}
                </option>
              ))}
            </Select>
            <Textarea className="lg:col-span-2" name="description" placeholder="Detalle del caso" />
            <label className="space-y-2 text-sm font-semibold text-slate-700 lg:col-span-2">
              Screenshots
              <Input accept="image/*" multiple name="attachments" type="file" />
              <span className="block text-xs text-slate-500">Hasta 5 imágenes de 5 MB cada una.</span>
            </label>
            <div className="lg:col-span-2">
              <button className={buttonClasses("primary")} type="submit">
                Crear ticket
              </button>
            </div>
          </form>
        </Card>

        <section className="space-y-3">
          <SectionTitle title="Tickets" description="Todos los casos creados por soporte y por los restaurantes." />
          <SupportTicketList allowUpdate emptyMessage="No hay tickets registrados." returnTo="/admin/soporte" showRestaurant tickets={tickets} />
        </section>

        <section className="space-y-3">
          <SectionTitle description="Usuarios admin/caja que tienen una sucursal tomada en este momento." title="Sesiones activas por restaurante" />
          <DataTable
            emptyMessage="No hay sesiones activas."
            headers={["Usuario", "Restaurante", "Rol", "IP", "Última actividad", "Acción"]}
            rows={accessSessions.map((session) => [
              <div key={`${session.id}-user`}>
                <p className="font-black">{session.userName}</p>
                <p className="text-xs text-slate-500">{session.userEmail}</p>
              </div>,
              session.restaurantName,
              session.role,
              session.ipAddress || "Sin IP",
              `${formatShortDate(session.lastSeenAt)} ${formatShortTime(session.lastSeenAt)}`,
              <form action={releaseAccessSessionByIdAction} key={session.id}>
                <input name="sessionId" type="hidden" value={session.id} />
                <button className={buttonClasses("secondary")} type="submit">
                  <LockOpen className="h-4 w-4" />
                  Liberar
                </button>
              </form>,
            ])}
          />
        </section>
      </div>
    </AdminLayout>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <p className="text-sm font-bold text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-black text-slate-950">{value}</p>
    </Card>
  );
}

function Banner({ children, tone }: { children: string; tone: "success" | "danger" }) {
  const className =
    tone === "success"
      ? "rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700"
      : "rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700";

  return <div className={className}>{children}</div>;
}
