import { CheckCircle2, ExternalLink, LockOpen, QrCode, ReceiptText, XCircle } from "lucide-react";
import Link from "next/link";
import { createSupportTicketAction, releaseAccessSessionByIdAction, resolveOwnerBranchCapacityAction, updateBranchRequestPaymentSettingsAction } from "@/app/admin/actions";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { CompressedImageInput } from "@/components/settings/CompressedImageInput";
import { SupportManualsPanel } from "@/components/support/SupportManualsPanel";
import { SupportTicketList } from "@/components/support/SupportTicketList";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { getBranchRequestPaymentSettings } from "@/lib/services/owner-dashboard.service";
import { restaurantService } from "@/lib/services/restaurant.service";
import { superadminService } from "@/lib/services/superadmin.service";
import { formatShortDate, formatShortTime } from "@/lib/utils/dates";
import { formatMoney } from "@/lib/utils/money";
import type { OwnerBranchRequest } from "@/types/superadmin.types";

const priorityOptions = [
  { value: "low", label: "Baja" },
  { value: "medium", label: "Media" },
  { value: "high", label: "Alta" },
  { value: "urgent", label: "Urgente" },
] as const;

const messages: Record<string, string> = {
  ticket: "Ticket creado correctamente.",
  updated: "Ticket actualizado.",
  released: "Sesion liberada.",
  settings: "QR y monto de solicitudes actualizados.",
  solicitud: "Solicitud resuelta correctamente.",
  "invalid-ticket": "Revisa los datos del ticket.",
  "invalid-ticket-update": "No se pudo actualizar el ticket.",
  "invalid-attachment": "Los adjuntos deben ser imagenes de hasta 5 MB.",
  "restaurant-required": "Debes asociar el ticket a un restaurante o crearlo como plataforma desde superadmin.",
  "invalid-branch-payment-settings": "Revisa el monto y la moneda de solicitudes.",
  "branch-request-qr-upload": "No se pudo subir el QR de solicitudes.",
  "invalid-branch-request": "Revisa la solicitud y el limite aprobado.",
  P0002: "La solicitud ya fue resuelta o no existe.",
};

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; ticket?: string; updated?: string; released?: string; settings?: string; saved?: string; error?: string }>;
}) {
  const [params, tickets, restaurants, accessSessions, branchRequests, branchPaymentSettings] = await Promise.all([
    searchParams,
    superadminService.listSupportTickets(),
    restaurantService.listRestaurants(),
    superadminService.listAccessSessions("active"),
    superadminService.listOwnerBranchRequests(),
    getBranchRequestPaymentSettings(),
  ]);

  const activeTab = params.tab === "manuales" ? "manuales" : params.tab === "solicitudes" ? "solicitudes" : "tickets";
  const openTickets = tickets.filter((ticket) => ["open", "in_progress", "waiting_customer"].includes(ticket.status));
  const urgentTickets = openTickets.filter((ticket) => ticket.priority === "urgent");
  const waitingCustomerTickets = tickets.filter((ticket) => ticket.status === "waiting_customer");
  const pendingBranchRequests = branchRequests.filter((request) => request.status === "pending");
  const feedback = params.error
    ? messages[params.error] ?? `No se pudo completar la accion: ${params.error}.`
    : params.ticket
      ? messages.ticket
      : params.updated
        ? messages.updated
        : params.released
          ? messages.released
          : params.settings
            ? messages.settings
            : params.saved === "solicitud"
              ? messages.solicitud
              : "";
  const feedbackTone = params.error ? "danger" : "success";

  return (
    <AdminLayout active="/admin/soporte" title="Soporte">
      <div className="space-y-6">
        <SectionTitle description="Casos de ayuda, screenshots, bloqueos de acceso y manuales operativos." title="Soporte" />

        <div className="flex gap-2 overflow-x-auto rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface)] p-2 shadow-sm">
          <Link className={buttonClasses(activeTab === "tickets" ? "primary" : "ghost", "shrink-0")} href="/admin/soporte">
            Tickets
          </Link>
          <Link className={buttonClasses(activeTab === "solicitudes" ? "primary" : "ghost", "shrink-0")} href="/admin/soporte?tab=solicitudes">
            Solicitudes
            {pendingBranchRequests.length ? <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">{pendingBranchRequests.length}</span> : null}
          </Link>
          <Link className={buttonClasses(activeTab === "manuales" ? "primary" : "ghost", "shrink-0")} href="/admin/soporte?tab=manuales">
            Manuales
          </Link>
        </div>

        {feedback ? <Banner tone={feedbackTone}>{feedback}</Banner> : null}

        {activeTab === "manuales" ? (
          <SupportManualsPanel />
        ) : activeTab === "solicitudes" ? (
          <BranchRequestsPanel requests={branchRequests} settings={branchPaymentSettings} />
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Tickets abiertos" value={String(openTickets.length)} />
              <MetricCard label="Urgentes" value={String(urgentTickets.length)} />
              <MetricCard label="Esperando cliente" value={String(waitingCustomerTickets.length)} />
              <MetricCard label="Sesiones activas" value={String(accessSessions.length)} />
            </div>

            <Card>
              <SectionTitle title="Nuevo ticket" description="Usalo para registrar incidentes internos o casos operativos de un restaurante." />
              <form action={createSupportTicketAction} className="mt-4 grid gap-3 lg:grid-cols-2">
                <Select name="restaurantId">
                  <option value="">Plataforma</option>
                  {restaurants.map((restaurant) => (
                    <option key={restaurant.id} value={restaurant.id}>
                      {restaurant.name}
                    </option>
                  ))}
                </Select>
                <Input name="title" placeholder="Titulo del caso" required />
                <Select name="category">
                  <option value="access">Acceso</option>
                  <option value="billing">Facturacion</option>
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
                <div className="space-y-2 text-sm font-semibold text-[var(--color-body)] lg:col-span-2">
                  Screenshots
                  <CompressedImageInput help="Hasta 5 imagenes. Se convertiran a WebP antes de subir." label="Screenshots" multiple name="attachments" />
                  <span className="block text-xs text-[var(--color-secondary-text)]">Hasta 5 imagenes de 5 MB cada una.</span>
                </div>
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
                headers={["Usuario", "Restaurante", "Rol", "IP", "Ultima actividad", "Accion"]}
                rows={accessSessions.map((session) => [
                  <div key={`${session.id}-user`}>
                    <p className="font-black">{session.userName}</p>
                    <p className="text-xs text-[var(--color-secondary-text)]">{session.userEmail}</p>
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
          </>
        )}
      </div>
    </AdminLayout>
  );
}

function BranchRequestsPanel({
  requests,
  settings,
}: {
  requests: OwnerBranchRequest[];
  settings: Awaited<ReturnType<typeof getBranchRequestPaymentSettings>>;
}) {
  const pending = requests.filter((request) => request.status === "pending");
  const approved = requests.filter((request) => request.status === "approved");
  const rejected = requests.filter((request) => request.status === "rejected");

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Pendientes" value={String(pending.length)} />
        <MetricCard label="Aprobadas" value={String(approved.length)} />
        <MetricCard label="Rechazadas" value={String(rejected.length)} />
      </div>

      <Card className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
        <form action={updateBranchRequestPaymentSettingsAction} className="grid gap-3 md:grid-cols-2">
          <SectionTitle className="md:col-span-2" title="Pago para nueva sucursal" description="QR y monto unitario que ve el dueno antes de enviar su comprobante." />
          <input name="currentBranchRequestQrUrl" type="hidden" value={settings.qrUrl ?? ""} />
          <Input defaultValue={settings.amount} min={0} name="amount" placeholder="Monto" required step="1" type="number" />
          <Input defaultValue={settings.currency} maxLength={3} minLength={3} name="currency" placeholder="BOB" required />
          <Textarea className="md:col-span-2" defaultValue={settings.qrNote ?? ""} name="qrNote" placeholder="Instrucciones de pago, alias o cuenta" />
          <div className="md:col-span-2">
            <CompressedImageInput help="QR que veran los duenos al solicitar una sucursal nueva." label="QR para sucursales" name="branchRequestQrFile" previewClassName="aspect-square" />
          </div>
          <div className="md:col-span-2">
            <button className={buttonClasses("primary")} type="submit">
              <QrCode className="h-4 w-4" />
              Guardar QR y monto
            </button>
          </div>
        </form>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-4">
          <p className="text-xs font-black uppercase text-[var(--color-secondary-text)]">Monto por sucursal</p>
          <p className="mt-1 text-2xl font-black text-[var(--color-heading)]">{formatMoney(settings.amount, settings.currency)}</p>
          {settings.qrUrl ? (
            <a className="mt-4 block overflow-hidden rounded-2xl border border-[var(--border)] bg-white" href={settings.qrUrl} rel="noreferrer" target="_blank">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="QR actual para solicitudes de sucursal" className="aspect-square w-full object-cover" src={settings.qrUrl} />
            </a>
          ) : (
            <div className="mt-4 grid aspect-square place-items-center rounded-2xl border border-dashed border-[var(--border)] text-sm font-bold text-[var(--color-secondary-text)]">
              Sin QR
            </div>
          )}
          {settings.qrNote ? <p className="mt-3 text-sm font-semibold leading-6 text-[var(--color-secondary-text)]">{settings.qrNote}</p> : null}
        </div>
      </Card>

      <section className="space-y-3">
        <SectionTitle title="Solicitudes de sucursales" description="Revisa el comprobante antes de aprobar la habilitacion." />
        <div className="grid gap-4">
          {requests.map((request) => (
            <BranchRequestCard key={request.id} request={request} />
          ))}
          {!requests.length ? <Card className="border-dashed text-sm font-semibold text-[var(--color-secondary-text)]">No hay solicitudes de sucursal registradas.</Card> : null}
        </div>
      </section>
    </div>
  );
}

function BranchRequestCard({ request }: { request: OwnerBranchRequest }) {
  const approvalBaseLimit = Math.max(request.currentLimit, request.ownerCurrentLimit);
  const approvedLimit = approvalBaseLimit + request.requestedAdditional;
  const canApprove = request.status === "pending" || request.status === "rejected";
  const canReject = request.status === "pending";
  const proofIsPdf = request.paymentProofFileName?.toLowerCase().endsWith(".pdf") || request.paymentProofUrl?.toLowerCase().includes(".pdf");

  return (
    <Card className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-lg font-black text-[var(--color-heading)]">Nueva sucursal para {request.ownerName}</p>
          <BranchRequestStatusBadge status={request.status} />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-[var(--color-secondary-text)]">
          <span>{request.ownerEmail}</span>
          <span>{request.sourceRestaurantName}</span>
          <span>{formatShortDate(request.createdAt)} {formatShortTime(request.createdAt)}</span>
        </div>
        <p className="mt-3 text-sm font-semibold leading-6 text-[var(--color-body)]">
          Solicita habilitar {request.requestedAdditional} sucursal{request.requestedAdditional === 1 ? "" : "es"}. Total registrado: {formatMoney(request.paymentAmount, request.paymentCurrency)}.
        </p>
        {request.reason ? <p className="mt-2 text-sm font-semibold leading-6 text-[var(--color-secondary-text)]">{request.reason}</p> : null}

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-3">
            <p className="text-xs font-black uppercase text-[var(--color-secondary-text)]">Comprobante</p>
            {request.paymentProofUrl ? (
              <a className="mt-2 block overflow-hidden rounded-2xl border border-[var(--border)] bg-white" href={request.paymentProofUrl} rel="noreferrer" target="_blank">
                {proofIsPdf ? (
                  <span className="flex min-h-32 items-center justify-center gap-2 p-4 text-sm font-black text-[var(--primary)]">
                    <ReceiptText className="h-5 w-5" />
                    Abrir PDF
                  </span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt={request.paymentProofFileName ?? "Comprobante"} className="aspect-[16/10] w-full object-cover" src={request.paymentProofUrl} />
                )}
              </a>
            ) : (
              <p className="mt-2 text-sm font-semibold text-[var(--color-secondary-text)]">Sin comprobante.</p>
            )}
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-3">
            <p className="text-xs font-black uppercase text-[var(--color-secondary-text)]">Cuenta</p>
            <p className="mt-2 text-sm font-semibold text-[var(--color-body)]">Habilitadas al solicitar: {request.currentLimit}</p>
            <p className="mt-1 text-sm font-semibold text-[var(--color-body)]">Habilitadas ahora: {approvalBaseLimit}</p>
            <p className="mt-1 text-sm font-semibold text-[var(--color-body)]">Solicitadas: {request.requestedAdditional}</p>
            <p className="mt-1 text-sm font-semibold text-[var(--color-body)]">Al aprobar: {approvedLimit}</p>
            <Link className="mt-3 inline-flex items-center gap-1 text-sm font-black text-[var(--primary)]" href={`/admin/restaurantes/${request.sourceRestaurantId}/cuenta`}>
              Ver cuenta
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {canApprove ? (
          <>
            {request.status === "rejected" ? (
              <div className="rounded-2xl bg-[var(--color-warning-soft)] p-3 text-xs font-bold leading-5 text-[var(--color-warning-strong)]">
                Esta solicitud fue rechazada. Si el pago llego despues, puedes aprobarla manualmente.
              </div>
            ) : null}
            <form action={resolveOwnerBranchCapacityAction} className="space-y-2">
              <input name="requestId" type="hidden" value={request.id} />
              <input name="restaurantId" type="hidden" value={request.sourceRestaurantId} />
              <input name="decision" type="hidden" value="approve" />
              <input name="returnTo" type="hidden" value="/admin/soporte?tab=solicitudes" />
              <Input defaultValue={approvedLimit} min={approvalBaseLimit} name="approvedLimit" required type="number" />
              <Textarea name="resolutionNotes" placeholder="Nota de aprobacion opcional" />
              <button className={buttonClasses("primary", "w-full")} type="submit">
                <CheckCircle2 className="h-4 w-4" />
                {request.status === "rejected" ? "Aprobar manualmente" : "Aprobar y habilitar"}
              </button>
            </form>
            {canReject ? (
              <form action={resolveOwnerBranchCapacityAction}>
                <input name="requestId" type="hidden" value={request.id} />
                <input name="restaurantId" type="hidden" value={request.sourceRestaurantId} />
                <input name="decision" type="hidden" value="reject" />
                <input name="returnTo" type="hidden" value="/admin/soporte?tab=solicitudes" />
                <button className={buttonClasses("secondary", "w-full")} type="submit">
                  <XCircle className="h-4 w-4" />
                  Rechazar
                </button>
              </form>
            ) : null}
          </>
        ) : (
          <div className="rounded-2xl bg-[var(--color-surface)] p-4 text-sm font-semibold leading-6 text-[var(--color-secondary-text)]">
            {request.status === "approved" ? `Aprobada con limite ${request.approvedLimit ?? approvedLimit}.` : "Solicitud rechazada."}
            {request.resolutionNotes ? <span className="mt-2 block">{request.resolutionNotes}</span> : null}
          </div>
        )}
      </div>
    </Card>
  );
}

function BranchRequestStatusBadge({ status }: { status: OwnerBranchRequest["status"] }) {
  const className =
    status === "approved"
      ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]"
      : status === "rejected"
        ? "bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]"
        : "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]";
  const label = status === "approved" ? "Aprobada" : status === "rejected" ? "Rechazada" : "Pendiente";

  return <Badge className={className}>{label}</Badge>;
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
