import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupportTicketAction } from "@/app/admin/actions";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { CompressedImageInput } from "@/components/settings/CompressedImageInput";
import { SupportManualsPanel } from "@/components/support/SupportManualsPanel";
import { SupportTicketList } from "@/components/support/SupportTicketList";
import { Button, buttonClasses } from "@/components/ui/Button";
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
  "invalid-attachment": "Los adjuntos deben ser imagenes de hasta 5 MB.",
};

export default async function RestaurantSupportPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantId: string }>;
  searchParams: Promise<{ tab?: string; ticket?: string; error?: string }>;
}) {
  const { restaurantId } = await params;
  const restaurant = await restaurantService.getById(restaurantId);

  if (!restaurant) {
    notFound();
  }

  await restaurantAccessService.claimOrRedirect(restaurant.id, `/admin/restaurantes/${restaurant.id}/soporte`);

  const [{ tab, ticket, error }, tickets] = await Promise.all([
    searchParams,
    superadminService.listSupportTickets(50, restaurant.id),
  ]);

  const activeTab = tab === "manuales" ? "manuales" : "tickets";
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
        <SectionTitle description="Tickets, manuales y guias operativas para el equipo." title="Soporte del restaurante" />

        <div className="flex gap-2 overflow-x-auto rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface)] p-2 shadow-sm">
          <Link className={buttonClasses(activeTab === "tickets" ? "primary" : "ghost", "shrink-0")} href={`/admin/restaurantes/${restaurant.id}/soporte`}>
            Tickets
          </Link>
          <Link className={buttonClasses(activeTab === "manuales" ? "primary" : "ghost", "shrink-0")} href={`/admin/restaurantes/${restaurant.id}/soporte?tab=manuales`}>
            Manuales
          </Link>
        </div>

        {feedback ? <Banner tone={feedbackTone}>{feedback}</Banner> : null}

        {activeTab === "manuales" ? (
          <SupportManualsPanel />
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <MetricCard label="Tickets abiertos" value={String(openTickets.length)} />
              <MetricCard label="Resueltos" value={String(resolvedTickets.length)} />
              <MetricCard label="Total" value={String(tickets.length)} />
            </div>

            <Card>
              <SectionTitle title="Nuevo ticket" description="Describe el problema con el mayor contexto posible para que soporte lo atienda mas rapido." />
              <form action={createSupportTicketAction} className="mt-4 grid gap-3 lg:grid-cols-2">
                <input name="restaurantId" type="hidden" value={restaurant.id} />
                <input name="returnTo" type="hidden" value={`/admin/restaurantes/${restaurant.id}/soporte`} />
                <Input name="title" placeholder="Titulo del problema" required />
                <Select defaultValue="medium" name="priority">
                  {priorityOptions.map((priority) => (
                    <option key={priority.value} value={priority.value}>
                      {priority.label}
                    </option>
                  ))}
                </Select>
                <Select name="category">
                  <option value="access">Acceso</option>
                  <option value="billing">Facturacion</option>
                  <option value="orders">Pedidos</option>
                  <option value="cash">Caja</option>
                  <option value="inventory">Inventario</option>
                  <option value="incident">Incidencia</option>
                  <option value="other">Otro</option>
                </Select>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] px-4 py-3 text-sm font-semibold text-[var(--color-secondary-text)]">
                  Restaurante: {restaurant.name}
                </div>
                <Textarea className="lg:col-span-2" name="description" placeholder="Que paso, desde cuando pasa, y que intento el equipo." />
                <div className="space-y-2 text-sm font-semibold text-[var(--color-body)] lg:col-span-2">
                  Screenshots
                  <CompressedImageInput help="Hasta 5 imagenes. Se convertiran a WebP antes de subir." label="Screenshots" multiple name="attachments" />
                  <span className="block text-xs text-[var(--color-secondary-text)]">Hasta 5 imagenes de 5 MB cada una.</span>
                </div>
                <div className="lg:col-span-2">
                  <Button>Enviar ticket</Button>
                </div>
              </form>
            </Card>

            <Card>
              <SectionTitle title="Solicitar nueva sucursal" description="Usa este flujo cuando el negocio abre otro local y quieres mantener cada sucursal separada." />
              <form action={createSupportTicketAction} className="mt-4 grid gap-3 lg:grid-cols-2">
                <input name="restaurantId" type="hidden" value={restaurant.id} />
                <input name="returnTo" type="hidden" value={`/admin/restaurantes/${restaurant.id}/soporte`} />
                <input name="title" type="hidden" value={`Nueva sucursal para ${restaurant.name}`} />
                <input name="category" type="hidden" value="billing" />
                <input name="priority" type="hidden" value="medium" />
                <Input name="branchName" placeholder="Nombre de la nueva sucursal" />
                <Input name="branchCity" placeholder="Ciudad" />
                <Input className="lg:col-span-2" name="branchAddress" placeholder="Direccion o zona" />
                <Textarea className="lg:col-span-2" name="description" placeholder="Datos utiles: WhatsApp, direccion exacta, plan esperado, si usara el mismo menu o uno distinto, fecha estimada de apertura." required />
                <div className="lg:col-span-2">
                  <Button>Enviar solicitud</Button>
                </div>
              </form>
            </Card>

            <section className="space-y-3">
              <SectionTitle title="Historial" description="Seguimiento de los tickets enviados por este restaurante." />
              <SupportTicketList emptyMessage="Todavia no hay tickets para este restaurante." tickets={tickets} />
            </section>
          </>
        )}
      </div>
    </AdminLayout>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <p className="text-sm font-bold text-[var(--color-secondary-text)]">{label}</p>
      <p className="mt-1 text-2xl font-black text-[var(--color-heading)]">{value}</p>
    </Card>
  );
}

function Banner({ children, tone }: { children: string; tone: "success" | "danger" }) {
  const className =
    tone === "success"
      ? "rounded-2xl border border-[var(--color-success-soft)] bg-[var(--color-success-soft)] p-4 text-sm font-semibold text-[var(--color-success-strong)]"
      : "rounded-2xl border border-[var(--color-danger-soft)] bg-[var(--color-danger-soft)] p-4 text-sm font-semibold text-[var(--color-danger-strong)]";

  return <div className={className}>{children}</div>;
}
