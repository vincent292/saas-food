import { notFound } from "next/navigation";
import { createSupportTicketAction } from "@/app/admin/actions";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { SupportTicketList } from "@/components/support/SupportTicketList";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { modulesForAdminLayout } from "@/lib/modules";
import { restaurantAccessService } from "@/lib/services/restaurant-access.service";
import { restaurantService } from "@/lib/services/restaurant.service";
import { superadminService } from "@/lib/services/superadmin.service";

const priorityOptions = [
  { value: "low", label: "Baja" },
  { value: "medium", label: "Media" },
  { value: "high", label: "Alta" },
  { value: "urgent", label: "Urgente" },
] as const;

const messages: Record<string, string> = {
  ticket: "Ticket enviado a soporte correctamente.",
  "invalid-ticket": "Revisa los datos del ticket.",
  "invalid-attachment": "Los adjuntos deben ser imágenes de hasta 5 MB.",
};

export default async function RestaurantSupportPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantId: string }>;
  searchParams: Promise<{ ticket?: string; error?: string }>;
}) {
  const { restaurantId } = await params;
  const restaurant = await restaurantService.getById(restaurantId);

  if (!restaurant) {
    notFound();
  }

  await restaurantAccessService.claimOrRedirect(restaurant.id, `/admin/restaurantes/${restaurant.id}/soporte`);

  const [{ ticket, error }, tickets] = await Promise.all([
    searchParams,
    superadminService.listSupportTickets(50, restaurant.id),
  ]);

  const openTickets = tickets.filter((item) => ["open", "in_progress", "waiting_customer"].includes(item.status));
  const resolvedTickets = tickets.filter((item) => ["resolved", "closed"].includes(item.status));
  const feedback = error ? messages[error] ?? `No se pudo enviar el ticket: ${error}.` : ticket ? messages.ticket : "";
  const feedbackTone = error ? "danger" : "success";

  return (
    <AdminLayout
      active="soporte"
      enabledModules={modulesForAdminLayout(restaurant)}
      restaurantId={restaurant.id}
      restaurantName={restaurant.name}
      restaurantStatus={restaurant.status}
      title="Soporte"
    >
      <div className="space-y-6">
        <SectionTitle description="Envía tickets a superadmin con detalle y screenshots del problema." title="Soporte del restaurante" />

        {feedback ? <Banner tone={feedbackTone}>{feedback}</Banner> : null}

        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard label="Tickets abiertos" value={String(openTickets.length)} />
          <MetricCard label="Resueltos" value={String(resolvedTickets.length)} />
          <MetricCard label="Total" value={String(tickets.length)} />
        </div>

        <Card>
          <SectionTitle title="Nuevo ticket" description="Describe el problema con el mayor contexto posible para que soporte lo atienda más rápido." />
          <form action={createSupportTicketAction} className="mt-4 grid gap-3 lg:grid-cols-2">
            <input name="restaurantId" type="hidden" value={restaurant.id} />
            <input name="returnTo" type="hidden" value={`/admin/restaurantes/${restaurant.id}/soporte`} />
            <Input name="title" placeholder="Título del problema" required />
            <Select defaultValue="medium" name="priority">
              {priorityOptions.map((priority) => (
                <option key={priority.value} value={priority.value}>
                  {priority.label}
                </option>
              ))}
            </Select>
            <Select name="category">
              <option value="access">Acceso</option>
              <option value="billing">Facturación</option>
              <option value="orders">Pedidos</option>
              <option value="cash">Caja</option>
              <option value="inventory">Inventario</option>
              <option value="incident">Incidencia</option>
              <option value="other">Otro</option>
            </Select>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
              Restaurante: {restaurant.name}
            </div>
            <Textarea className="lg:col-span-2" name="description" placeholder="Qué pasó, desde cuándo pasa, y qué intentó el equipo." />
            <label className="space-y-2 text-sm font-semibold text-slate-700 lg:col-span-2">
              Screenshots
              <Input accept="image/*" multiple name="attachments" type="file" />
              <span className="block text-xs text-slate-500">Hasta 5 imágenes de 5 MB cada una.</span>
            </label>
            <div className="lg:col-span-2">
              <Button>Enviar ticket</Button>
            </div>
          </form>
        </Card>

        <section className="space-y-3">
          <SectionTitle title="Historial" description="Seguimiento de los tickets enviados por este restaurante." />
          <SupportTicketList emptyMessage="Todavía no hay tickets para este restaurante." tickets={tickets} />
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
