import Link from "next/link";
import { CheckCircle2, Clock3, ExternalLink, LifeBuoy, MessageCircle, Plus, ReceiptText, XCircle } from "lucide-react";
import { OwnerLayout, getOwnerLayoutContext } from "@/components/layout/OwnerLayout";
import { BranchRequestFormClient } from "@/components/owner/BranchRequestFormClient";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { getBranchRequestPaymentSettings, listOwnerBranchCapacityRequests } from "@/lib/services/owner-dashboard.service";
import { formatMoney } from "@/lib/utils/money";

const requestErrors: Record<string, string> = {
  "invalid-branch-request": "Revisa la cantidad solicitada.",
  "branch-request-pending": "Ya tienes una solicitud pendiente. El superadmin debe resolverla antes de crear otra.",
  "owner-required": "No encontramos una sucursal principal asociada a tu cuenta.",
  "branch-payment-unconfigured": "Aun no hay QR configurado para pagar una nueva sucursal.",
  "branch-payment-proof-required": "Debes subir el comprobante de pago para enviar la solicitud.",
  "invalid-branch-payment-proof": "El comprobante debe ser imagen o PDF de hasta 5 MB.",
  "branch-payment-proof-upload": "No se pudo subir el comprobante. Intenta con otro archivo.",
};

export default async function OwnerSupportPage({ searchParams }: { searchParams: Promise<{ requested?: string; error?: string }> }) {
  const [{ requested, error }, { ownerMemberships, profile }] = await Promise.all([searchParams, getOwnerLayoutContext()]);
  const firstRestaurantId = ownerMemberships[0]?.restaurant.id;
  const [requests, paymentSettings] = await Promise.all([listOwnerBranchCapacityRequests(profile.id), getBranchRequestPaymentSettings()]);
  const hasPendingRequest = requests.some((request) => request.status === "pending");
  const unitPaymentLabel = formatMoney(paymentSettings.amount, paymentSettings.currency);

  return (
    <OwnerLayout active="/dueno/soporte" memberships={ownerMemberships} title="Soporte">
      <div className="space-y-6">
        <Card className="grid gap-4 sm:grid-cols-[auto_1fr_auto] sm:items-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--primary-light)] text-[var(--primary)]">
            <LifeBuoy className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-2xl font-black">Soporte del negocio</h2>
            <p className="mt-1 text-sm font-semibold text-[var(--color-secondary-text)]">
              Para incidencias operativas se abre ticket desde una sucursal. Para nuevas sucursales puedes iniciar la solicitud desde aqui.
            </p>
          </div>
          {firstRestaurantId ? (
            <Link className={buttonClasses("primary")} href={`/admin/restaurantes/${firstRestaurantId}/soporte`}>
              <MessageCircle className="h-4 w-4" />
              Abrir ticket
            </Link>
          ) : null}
        </Card>

        <SectionTitle description="Acciones frecuentes para duenos." title="Solicitudes" />

        {requested ? <div className="rounded-2xl bg-[var(--color-success-soft)] p-4 text-sm font-bold text-[var(--color-success-strong)]">Solicitud enviada. Te mostraremos aqui cuando sea aprobada o rechazada.</div> : null}
        {error ? <div className="rounded-2xl bg-[var(--color-danger-soft)] p-4 text-sm font-bold text-[var(--color-danger-strong)]">{requestErrors[error] ?? "No se pudo enviar la solicitud."}</div> : null}

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <Plus className="h-6 w-6 text-[var(--primary)]" />
                <p className="mt-3 text-lg font-black">Solicitar nueva sucursal</p>
                <p className="mt-1 text-sm font-semibold leading-6 text-[var(--color-secondary-text)]">
                  El pago es de {unitPaymentLabel} por sucursal. El total se calcula segun la cantidad que solicites.
                </p>
              </div>
              <span className="w-fit rounded-full bg-[var(--primary-light)] px-3 py-1 text-sm font-black text-[var(--primary)]">{unitPaymentLabel} c/u</span>
            </div>

            {paymentSettings.qrUrl ? (
              <div className="grid gap-4 rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-4 sm:grid-cols-[132px_1fr] sm:items-center">
                <a className="block overflow-hidden rounded-2xl border border-[var(--border)] bg-white" href={paymentSettings.qrUrl} rel="noreferrer" target="_blank">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt="QR de pago para nueva sucursal" className="aspect-square w-full object-cover" src={paymentSettings.qrUrl} />
                </a>
                <div>
                  <p className="font-black text-[var(--color-heading)]">Pago directo con QR</p>
                  <p className="mt-1 text-sm font-semibold leading-6 text-[var(--color-secondary-text)]">
                    Elige cuantas sucursales necesitas, paga el total y adjunta una captura o PDF del comprobante.
                  </p>
                  {paymentSettings.qrNote ? <p className="mt-2 text-sm font-bold text-[var(--color-body)]">{paymentSettings.qrNote}</p> : null}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl bg-[var(--color-warning-soft)] p-4 text-sm font-bold text-[var(--color-warning-strong)]">
                Aun no hay QR disponible para solicitar nuevas sucursales.
              </div>
            )}

            {firstRestaurantId ? (
              <BranchRequestFormClient disabled={hasPendingRequest} qrConfigured={Boolean(paymentSettings.qrUrl)} restaurantId={firstRestaurantId} unitAmount={paymentSettings.amount} currency={paymentSettings.currency} />
            ) : null}
          </Card>
          <Card className="space-y-4">
            <ReceiptText className="h-6 w-6 text-[var(--primary)]" />
            <div>
              <p className="text-lg font-black">Revision de pago</p>
              <p className="mt-1 text-sm font-semibold leading-6 text-[var(--color-secondary-text)]">
                Cuando el comprobante sea aprobado, se habilitaran las sucursales solicitadas en tu cuenta. Luego podras crearlas desde el modulo Sucursales.
              </p>
            </div>
            <div className="rounded-2xl bg-[var(--color-surface)] p-4 text-sm font-semibold leading-6 text-[var(--color-secondary-text)]">
              Si necesitas ayuda con responsables, correos o acceso, abre un ticket desde una sucursal activa.
            </div>
          </Card>
        </div>

        <SectionTitle description="Seguimiento de las solicitudes enviadas." title="Historial de solicitudes de sucursal" />
        <div className="grid gap-3">
          {requests.map((request) => {
            const icon = request.status === "approved" ? <CheckCircle2 className="h-5 w-5 text-[var(--color-success-strong)]" /> : request.status === "rejected" ? <XCircle className="h-5 w-5 text-[var(--color-danger-strong)]" /> : <Clock3 className="h-5 w-5 text-[var(--color-warning-strong)]" />;
            return (
              <Card className="grid gap-3 lg:grid-cols-[auto_1fr_auto] lg:items-center" key={request.id}>
                {icon}
                <div>
                  <p className="font-black">{request.requestedAdditional} sucursal{request.requestedAdditional === 1 ? "" : "es"} adicional{request.requestedAdditional === 1 ? "" : "es"}</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--color-secondary-text)]">
                    Pago total: {formatMoney(request.paymentAmount, request.paymentCurrency)}. {request.reason || "Sin comentario"}
                  </p>
                  {request.paymentProofUrl ? (
                    <a className="mt-2 inline-flex items-center gap-1 text-sm font-black text-[var(--primary)]" href={request.paymentProofUrl} rel="noreferrer" target="_blank">
                      Ver comprobante
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                </div>
                <span className="text-xs font-black uppercase text-[var(--color-secondary-text)]">{request.status === "approved" ? "Aprobada" : request.status === "rejected" ? "Rechazada" : "Pendiente"}</span>
              </Card>
            );
          })}
          {!requests.length ? <Card className="border-dashed text-sm font-semibold text-[var(--color-secondary-text)]">Todavia no enviaste solicitudes de sucursal.</Card> : null}
        </div>
      </div>
    </OwnerLayout>
  );
}
