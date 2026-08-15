import { Ban, CheckCircle2, ExternalLink, LockOpen, Power, QrCode, ReceiptText, XCircle } from "lucide-react";
import Link from "next/link";
import {
  createSupportTicketAction,
  releaseAccessSessionByIdAction,
  resolveOwnerBranchCapacityAction,
  resolveRiderApplicationAction,
  resolveRiderRenewalAction,
  updateRestaurantRiderStatusAction,
  updateBranchRequestPaymentSettingsAction,
  updateRiderPaymentSettingsAction,
} from "@/app/admin/actions";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { QrPaymentViewer } from "@/components/payments/QrPaymentViewer";
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
import { riderService } from "@/lib/services/rider.service";
import { superadminService } from "@/lib/services/superadmin.service";
import { formatShortDate, formatShortTime } from "@/lib/utils/dates";
import { formatMoney } from "@/lib/utils/money";
import type { RestaurantRider, RiderApplication, RiderRenewalRequest } from "@/types/rider.types";
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
  rider: "Solicitud rider resuelta correctamente.",
  "rider-status": "Estado del rider actualizado.",
  renewal: "Renovacion rider resuelta correctamente.",
  solicitud: "Solicitud resuelta correctamente.",
  "invalid-ticket": "Revisa los datos del ticket.",
  "invalid-ticket-update": "No se pudo actualizar el ticket.",
  "invalid-attachment": "Los adjuntos deben ser imagenes de hasta 5 MB.",
  "restaurant-required": "Debes asociar el ticket a un restaurante o crearlo como plataforma desde superadmin.",
  "invalid-branch-payment-settings": "Revisa el monto y la moneda de solicitudes.",
  "branch-request-qr-upload": "No se pudo subir el QR de solicitudes.",
  "invalid-branch-request": "Revisa la solicitud y el limite aprobado.",
  "invalid-rider-application": "Revisa la solicitud rider.",
  "invalid-rider-renewal": "Revisa la renovacion rider.",
  "invalid-rider-payment-settings": "Revisa el monto y la moneda para riders.",
  "invalid-rider-status": "Revisa el estado del rider.",
  "rider-application-not-found": "La solicitud rider ya no esta pendiente o no existe.",
  "rider-renewal-not-found": "La renovacion rider ya no esta pendiente o no existe.",
  "rider-not-found": "No encontramos ese rider.",
  "rider-payment-qr-upload": "No se pudo subir el QR para riders.",
  P0002: "La solicitud ya fue resuelta o no existe.",
};

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; ticket?: string; updated?: string; released?: string; settings?: string; saved?: string; error?: string }>;
}) {
  const [params, tickets, restaurants, accessSessions, branchRequests, branchPaymentSettings, riderApplications, riderPaymentSettings, restaurantRiders, riderRenewalRequests] = await Promise.all([
    searchParams,
    superadminService.listSupportTickets(),
    restaurantService.listRestaurants(),
    superadminService.listAccessSessions("active"),
    superadminService.listOwnerBranchRequests(),
    getBranchRequestPaymentSettings(),
    riderService.listApplications(),
    riderService.getPaymentSettings(),
    riderService.listRestaurantRiders(),
    riderService.listRenewalRequests(),
  ]);

  const activeTab = params.tab === "manuales" ? "manuales" : params.tab === "riders" ? "riders" : params.tab === "solicitudes" ? "solicitudes" : "tickets";
  const openTickets = tickets.filter((ticket) => ["open", "in_progress", "waiting_customer"].includes(ticket.status));
  const urgentTickets = openTickets.filter((ticket) => ticket.priority === "urgent");
  const waitingCustomerTickets = tickets.filter((ticket) => ticket.status === "waiting_customer");
  const pendingBranchRequests = branchRequests.filter((request) => request.status === "pending");
  const pendingRiderApplications = riderApplications.filter((application) => application.status === "submitted");
  const pendingRiderRenewals = riderRenewalRequests.filter((renewal) => renewal.status === "submitted");
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
              : params.saved === "rider"
                ? messages.rider
                : params.saved === "rider-status"
                  ? messages["rider-status"]
                  : params.saved === "renewal"
                    ? messages.renewal
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
          <Link className={buttonClasses(activeTab === "riders" ? "primary" : "ghost", "shrink-0")} href="/admin/soporte?tab=riders">
            Riders
            {pendingRiderApplications.length + pendingRiderRenewals.length ? (
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">{pendingRiderApplications.length + pendingRiderRenewals.length}</span>
            ) : null}
          </Link>
          <Link className={buttonClasses(activeTab === "manuales" ? "primary" : "ghost", "shrink-0")} href="/admin/soporte?tab=manuales">
            Manuales
          </Link>
        </div>

        {feedback ? <Banner tone={feedbackTone}>{feedback}</Banner> : null}

        {activeTab === "manuales" ? (
          <SupportManualsPanel />
        ) : activeTab === "riders" ? (
          <RiderApplicationsPanel applications={riderApplications} renewalRequests={riderRenewalRequests} riders={restaurantRiders} settings={riderPaymentSettings} />
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
            <QrPaymentViewer
              alt="QR actual para solicitudes de sucursal"
              className="mt-4"
              downloadFileName="qr-solicitudes-sucursal.png"
              imageClassName="h-auto w-full aspect-square"
              subtitle="QR visible para los duenos al solicitar sucursales."
              title="QR solicitudes de sucursal"
              url={settings.qrUrl}
            />
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

function RiderApplicationsPanel({
  applications,
  renewalRequests,
  riders,
  settings,
}: {
  applications: RiderApplication[];
  renewalRequests: RiderRenewalRequest[];
  riders: RestaurantRider[];
  settings: Awaited<ReturnType<typeof riderService.getPaymentSettings>>;
}) {
  const pending = applications.filter((application) => application.status === "submitted");
  const pendingRenewals = renewalRequests.filter((renewal) => renewal.status === "submitted");
  const activeRiders = riders.filter((rider) => rider.status === "active" && !isRiderExpired(rider));
  const expiredRiders = riders.filter((rider) => isRiderExpired(rider));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Solicitudes pendientes" value={String(pending.length)} />
        <MetricCard label="Renovaciones pendientes" value={String(pendingRenewals.length)} />
        <MetricCard label="Riders activos" value={String(activeRiders.length)} />
        <MetricCard label="Vencidos" value={String(expiredRiders.length)} />
      </div>

      <Card className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
        <form action={updateRiderPaymentSettingsAction} className="grid gap-3 md:grid-cols-2">
          <SectionTitle className="md:col-span-2" title="Pago para riders" description="QR y monto mensual que ven los riders antes de enviar su solicitud." />
          <input name="currentRiderPaymentQrUrl" type="hidden" value={settings.qrUrl ?? ""} />
          <Input defaultValue={settings.amount} min={0} name="amount" placeholder="Monto" required step="1" type="number" />
          <Input defaultValue={settings.currency} maxLength={3} minLength={3} name="currency" placeholder="BOB" required />
          <Textarea className="md:col-span-2" defaultValue={settings.qrNote ?? ""} name="qrNote" placeholder="Instrucciones de pago, alias o cuenta" />
          <div className="md:col-span-2">
            <CompressedImageInput help="QR que veran los riders al registrarse desde el link del restaurante." label="QR membresia rider" name="riderPaymentQrFile" previewClassName="aspect-square" />
          </div>
          <div className="md:col-span-2">
            <button className={buttonClasses("primary")} type="submit">
              <QrCode className="h-4 w-4" />
              Guardar QR y monto
            </button>
          </div>
        </form>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-4">
          <p className="text-xs font-black uppercase text-[var(--color-secondary-text)]">Membresia mensual</p>
          <p className="mt-1 text-2xl font-black text-[var(--color-heading)]">{formatMoney(settings.amount, settings.currency)}</p>
          {settings.qrUrl ? (
            <QrPaymentViewer
              alt="QR actual para membresia rider"
              className="mt-4"
              downloadFileName="qr-membresia-rider.png"
              imageClassName="h-auto w-full aspect-square"
              subtitle="QR visible en el formulario publico de riders."
              title="QR riders"
              url={settings.qrUrl}
            />
          ) : (
            <div className="mt-4 grid aspect-square place-items-center rounded-2xl border border-dashed border-[var(--border)] text-sm font-bold text-[var(--color-secondary-text)]">
              Sin QR
            </div>
          )}
          {settings.qrNote ? <p className="mt-3 text-sm font-semibold leading-6 text-[var(--color-secondary-text)]">{settings.qrNote}</p> : null}
        </div>
      </Card>

      <section className="space-y-3">
        <SectionTitle title="Solicitudes riders" description="Revisa documentos, placa, RUAT y comprobante antes de habilitar al rider." />
        <div className="grid gap-4">
          {applications.map((application) => (
            <RiderApplicationCard application={application} key={application.id} />
          ))}
          {!applications.length ? <Card className="border-dashed text-sm font-semibold text-[var(--color-secondary-text)]">No hay solicitudes rider registradas.</Card> : null}
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle title="Renovaciones mensuales" description="Valida comprobantes para extender un mes de membresia al rider." />
        <div className="grid gap-4">
          {renewalRequests.map((renewal) => (
            <RiderRenewalCard key={renewal.id} renewal={renewal} />
          ))}
          {!renewalRequests.length ? <Card className="border-dashed text-sm font-semibold text-[var(--color-secondary-text)]">No hay renovaciones rider registradas.</Card> : null}
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle title="Riders habilitados" description="Control operativo de riders por restaurante y vencimiento de membresia." />
        <div className="grid gap-4 lg:grid-cols-2">
          {riders.map((rider) => (
            <RestaurantRiderCard key={rider.id} rider={rider} />
          ))}
          {!riders.length ? <Card className="border-dashed text-sm font-semibold text-[var(--color-secondary-text)]">No hay riders habilitados todavia.</Card> : null}
        </div>
      </section>
    </div>
  );
}

function RiderApplicationCard({ application }: { application: RiderApplication }) {
  const canResolve = application.status === "submitted";

  return (
    <Card className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-lg font-black text-[var(--color-heading)]">{application.fullName}</p>
          <RiderApplicationStatusBadge status={application.status} />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-[var(--color-secondary-text)]">
          <span>{application.restaurantName}</span>
          <span>{application.email}</span>
          <span>{application.phone}</span>
          <span>{formatShortDate(application.createdAt)} {formatShortTime(application.createdAt)}</span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <InfoBox label="CI" value={application.documentNumber} />
          <InfoBox label="Placa" value={application.plateNumber} />
          <InfoBox label="RUAT" value={application.ruatNumber} />
          <InfoBox label="Pago" value={formatMoney(application.paymentAmount, application.paymentCurrency)} />
        </div>
        <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-3 text-sm font-semibold text-[var(--color-body)]">
          Propietario de la moto: <strong>{application.vehicleOwnerName}</strong>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <DocumentPreview label="CI anverso" url={application.ciFrontUrl} />
          <DocumentPreview label="CI reverso" url={application.ciBackUrl} />
          <DocumentPreview label="RUAT anverso" url={application.ruatFrontUrl} />
          <DocumentPreview label="RUAT reverso" url={application.ruatBackUrl} />
          <DocumentPreview label="Carnet propietario" url={application.ownerDocumentUrl} />
          <DocumentPreview label="Foto placa / moto" url={application.platePhotoUrl} />
          <DocumentPreview label="Comprobante" url={application.paymentProofUrl} fileName={application.paymentProofFileName} />
        </div>
      </div>

      <div className="space-y-2">
        {canResolve ? (
          <>
            <form action={resolveRiderApplicationAction} className="space-y-2">
              <input name="applicationId" type="hidden" value={application.id} />
              <input name="decision" type="hidden" value="approve" />
              <Textarea name="resolutionNotes" placeholder="Nota de aprobacion opcional" />
              <button className={buttonClasses("primary", "w-full")} type="submit">
                <CheckCircle2 className="h-4 w-4" />
                Aprobar y habilitar
              </button>
            </form>
            <form action={resolveRiderApplicationAction} className="space-y-2">
              <input name="applicationId" type="hidden" value={application.id} />
              <input name="decision" type="hidden" value="reject" />
              <Textarea name="resolutionNotes" placeholder="Motivo de rechazo opcional" />
              <button className={buttonClasses("secondary", "w-full")} type="submit">
                <XCircle className="h-4 w-4" />
                Rechazar
              </button>
            </form>
          </>
        ) : (
          <div className="rounded-2xl bg-[var(--color-surface)] p-4 text-sm font-semibold leading-6 text-[var(--color-secondary-text)]">
            {application.status === "approved" ? "Rider habilitado para este restaurante." : "Solicitud rechazada."}
            {application.reviewedAt ? <span className="mt-2 block">Revision: {formatShortDate(application.reviewedAt)} {formatShortTime(application.reviewedAt)}</span> : null}
            {application.resolutionNotes ? <span className="mt-2 block">{application.resolutionNotes}</span> : null}
          </div>
        )}
      </div>
    </Card>
  );
}

function RiderRenewalCard({ renewal }: { renewal: RiderRenewalRequest }) {
  const canResolve = renewal.status === "submitted";

  return (
    <Card className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-lg font-black text-[var(--color-heading)]">{renewal.riderName}</p>
          <RiderRenewalStatusBadge status={renewal.status} />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-[var(--color-secondary-text)]">
          <span>{renewal.restaurantName}</span>
          <span>{renewal.riderPhone || "Sin telefono"}</span>
          <span>Placa {renewal.riderPlateNumber || "sin placa"}</span>
          <span>{formatShortDate(renewal.createdAt)} {formatShortTime(renewal.createdAt)}</span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <InfoBox label="Pago" value={formatMoney(renewal.paymentAmount, renewal.paymentCurrency)} />
          <InfoBox label="Estado" value={renewal.status === "submitted" ? "Pendiente" : renewal.status === "approved" ? "Aprobada" : "Rechazada"} />
          <InfoBox label="Vigencia aprobada" value={renewal.approvedValidUntil ? formatShortDate(renewal.approvedValidUntil) : "Sin aprobar"} />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <DocumentPreview label="Comprobante renovacion" url={renewal.paymentProofUrl} fileName={renewal.paymentProofFileName} />
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-3 text-sm font-semibold leading-6 text-[var(--color-body)]">
            <p className="text-xs font-black uppercase text-[var(--color-secondary-text)]">Pago registrado</p>
            <p className="mt-2">{formatMoney(renewal.paymentAmount, renewal.paymentCurrency)}</p>
            {renewal.paymentQrNote ? <p className="mt-2 text-[var(--color-secondary-text)]">{renewal.paymentQrNote}</p> : null}
            {renewal.reviewedAt ? <p className="mt-2 text-[var(--color-secondary-text)]">Revision: {formatShortDate(renewal.reviewedAt)} {formatShortTime(renewal.reviewedAt)}</p> : null}
            {renewal.resolutionNotes ? <p className="mt-2 text-[var(--color-secondary-text)]">{renewal.resolutionNotes}</p> : null}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {canResolve ? (
          <>
            <form action={resolveRiderRenewalAction} className="space-y-2">
              <input name="renewalId" type="hidden" value={renewal.id} />
              <input name="decision" type="hidden" value="approve" />
              <Textarea name="resolutionNotes" placeholder="Nota de aprobacion opcional" />
              <button className={buttonClasses("primary", "w-full")} type="submit">
                <CheckCircle2 className="h-4 w-4" />
                Aprobar renovacion
              </button>
            </form>
            <form action={resolveRiderRenewalAction} className="space-y-2">
              <input name="renewalId" type="hidden" value={renewal.id} />
              <input name="decision" type="hidden" value="reject" />
              <Textarea name="resolutionNotes" placeholder="Motivo de rechazo opcional" />
              <button className={buttonClasses("secondary", "w-full")} type="submit">
                <XCircle className="h-4 w-4" />
                Rechazar
              </button>
            </form>
          </>
        ) : (
          <div className="rounded-2xl bg-[var(--color-surface)] p-4 text-sm font-semibold leading-6 text-[var(--color-secondary-text)]">
            {renewal.status === "approved" ? "Membresia extendida." : "Renovacion rechazada."}
          </div>
        )}
      </div>
    </Card>
  );
}

function RestaurantRiderCard({ rider }: { rider: RestaurantRider }) {
  const expired = isRiderExpired(rider);
  const nextStatus = rider.status === "active" ? "suspended" : "active";

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-black text-[var(--color-heading)]">{rider.fullName}</p>
            <RestaurantRiderStatusBadge expired={expired} status={rider.status} />
          </div>
          <p className="mt-1 text-sm font-semibold text-[var(--color-secondary-text)]">{rider.restaurantName}</p>
        </div>
        <form action={updateRestaurantRiderStatusAction}>
          <input name="restaurantRiderId" type="hidden" value={rider.id} />
          <input name="status" type="hidden" value={nextStatus} />
          <button className={buttonClasses(rider.status === "active" ? "secondary" : "primary", "shrink-0")} type="submit">
            {rider.status === "active" ? <Ban className="h-4 w-4" /> : <Power className="h-4 w-4" />}
            {rider.status === "active" ? "Suspender" : "Reactivar"}
          </button>
        </form>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <InfoBox label="Telefono" value={rider.phone} />
        <InfoBox label="Placa" value={rider.plateNumber} />
        <InfoBox label="CI" value={rider.documentNumber} />
        <InfoBox label="Vence" value={formatShortDate(rider.membershipValidUntil)} />
      </div>
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-3 text-sm font-semibold text-[var(--color-body)]">
        <p>Propietario de la moto: <strong>{rider.vehicleOwnerName}</strong></p>
        <p className="mt-1">RUAT: <strong>{rider.ruatNumber}</strong></p>
        <p className="mt-1">Membresia: <strong>{formatMoney(rider.membershipAmount, rider.membershipCurrency)}</strong></p>
        {rider.hasPendingRenewal ? <p className="mt-2 text-[var(--color-warning-strong)]">Tiene una renovacion pendiente de revision.</p> : null}
      </div>
    </Card>
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

function RiderApplicationStatusBadge({ status }: { status: RiderApplication["status"] }) {
  const className =
    status === "approved"
      ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]"
      : status === "rejected"
        ? "bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]"
        : "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]";
  const label = status === "approved" ? "Aprobada" : status === "rejected" ? "Rechazada" : "Pendiente";

  return <Badge className={className}>{label}</Badge>;
}

function RiderRenewalStatusBadge({ status }: { status: RiderRenewalRequest["status"] }) {
  const className =
    status === "approved"
      ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]"
      : status === "rejected"
        ? "bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]"
        : "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]";
  const label = status === "approved" ? "Aprobada" : status === "rejected" ? "Rechazada" : "Pendiente";

  return <Badge className={className}>{label}</Badge>;
}

function RestaurantRiderStatusBadge({ expired, status }: { expired: boolean; status: RestaurantRider["status"] }) {
  const className =
    status === "suspended"
      ? "bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]"
      : expired
        ? "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]"
        : "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]";
  const label = status === "suspended" ? "Suspendido" : expired ? "Vencido" : "Activo";

  return <Badge className={className}>{label}</Badge>;
}

function isRiderExpired(rider: RestaurantRider) {
  return rider.membershipValidUntil < new Date().toISOString().slice(0, 10);
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-3">
      <p className="text-xs font-black uppercase text-[var(--color-secondary-text)]">{label}</p>
      <p className="mt-1 break-words text-sm font-black text-[var(--color-heading)]">{value}</p>
    </div>
  );
}

function DocumentPreview({ fileName, label, url }: { fileName?: string; label: string; url: string }) {
  const isPdf = fileName?.toLowerCase().endsWith(".pdf") || url.toLowerCase().includes(".pdf");

  return (
    <a className="block overflow-hidden rounded-2xl border border-[var(--border)] bg-white" href={url} rel="noreferrer" target="_blank">
      <div className="border-b border-[var(--border)] bg-[var(--color-surface)] px-3 py-2 text-xs font-black uppercase text-[var(--color-secondary-text)]">
        {label}
      </div>
      {isPdf ? (
        <span className="flex min-h-32 items-center justify-center gap-2 p-4 text-sm font-black text-[var(--primary)]">
          <ReceiptText className="h-5 w-5" />
          Abrir PDF
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt={label} className="aspect-[16/10] w-full object-cover" src={url} />
      )}
    </a>
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
