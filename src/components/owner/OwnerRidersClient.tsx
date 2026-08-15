"use client";

import { AlertTriangle, CheckCircle2, Copy, ExternalLink, ReceiptText } from "lucide-react";
import { useState } from "react";
import { requestRiderRenewalAction } from "@/app/admin/actions";
import { QrPaymentViewer } from "@/components/payments/QrPaymentViewer";
import { CompressedImageInput } from "@/components/settings/CompressedImageInput";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormSubmitButton } from "@/components/ui/FormSubmitButton";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { formatShortDate } from "@/lib/utils/dates";
import { formatMoney } from "@/lib/utils/money";
import type { OwnerRiderBranch, RestaurantRider, RiderPaymentSettings, RiderRenewalRequest } from "@/types/rider.types";

export function OwnerRidersClient({
  branches,
  errorMessage,
  payment,
  renewalSent,
}: {
  branches: OwnerRiderBranch[];
  errorMessage?: string;
  payment: RiderPaymentSettings;
  renewalSent?: boolean;
}) {
  const [copied, setCopied] = useState("");
  const totalRiders = branches.reduce((sum, branch) => sum + branch.riders.length, 0);
  const pendingRenewals = branches.reduce((sum, branch) => sum + branch.renewalRequests.filter((renewal) => renewal.status === "submitted").length, 0);
  const expiredRiders = branches.reduce((sum, branch) => sum + branch.riders.filter(isRiderExpired).length, 0);

  async function copyInvite(url: string) {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(url);
    window.setTimeout(() => setCopied((current) => (current === url ? "" : current)), 1800);
  }

  return (
    <div className="space-y-6">
      {renewalSent ? (
        <Banner tone="success">Comprobante enviado. El superadmin debe revisar el pago para extender la membresia.</Banner>
      ) : null}
      {errorMessage ? <Banner tone="danger">{errorMessage}</Banner> : null}

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Riders registrados" value={String(totalRiders)} />
        <MetricCard label="Renovaciones pendientes" value={String(pendingRenewals)} />
        <MetricCard label="Membresias vencidas" value={String(expiredRiders)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <SectionTitle
            title="Registro por sucursal"
            description="Comparte un solo link por sucursal. Cada rider llena sus datos y queda como una solicitud nueva para superadmin."
          />
          <div className="mt-4 grid gap-3">
            {branches.map((branch) => (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-4" key={branch.restaurantId}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <p className="text-lg font-black text-[var(--color-heading)]">{branch.restaurantName}</p>
                    <p className="mt-1 text-sm font-semibold text-[var(--color-secondary-text)]">{branch.restaurantCity || "Sin ciudad"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className={buttonClasses("secondary")} disabled={!branch.inviteUrl} onClick={() => copyInvite(branch.inviteUrl)} type="button">
                      {copied === branch.inviteUrl ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      {copied === branch.inviteUrl ? "Copiado" : "Copiar link"}
                    </button>
                    {branch.inviteUrl ? (
                      <a className={buttonClasses("primary")} href={branch.inviteUrl} rel="noreferrer" target="_blank">
                        Abrir
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    ) : null}
                  </div>
                </div>
                <p className="mt-3 break-all rounded-xl bg-white px-3 py-2 text-xs font-bold text-[var(--color-secondary-text)]">
                  {branch.inviteUrl || "No se pudo generar el link. Revisa Supabase/service role."}
                </p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="space-y-4">
          <SectionTitle title="Pago mensual rider" description="Monto que se valida desde superadmin." />
          <div>
            <p className="text-xs font-black uppercase text-[var(--color-secondary-text)]">Membresia</p>
            <p className="mt-1 text-3xl font-black text-[var(--color-heading)]">{formatMoney(payment.amount, payment.currency)}</p>
          </div>
          {payment.qrUrl ? (
            <QrPaymentViewer
              alt="QR de membresia rider"
              downloadFileName="qr-membresia-rider.png"
              imageClassName="h-auto w-full max-w-[240px] aspect-square"
              subtitle="Pago mensual para habilitar o renovar riders."
              title="QR riders"
              url={payment.qrUrl}
            />
          ) : (
            <div className="grid aspect-square place-items-center rounded-2xl border border-dashed border-[var(--border)] text-sm font-bold text-[var(--color-secondary-text)]">
              QR pendiente
            </div>
          )}
          {payment.qrNote ? <p className="rounded-2xl bg-[var(--color-surface)] p-3 text-sm font-semibold leading-6 text-[var(--color-secondary-text)]">{payment.qrNote}</p> : null}
        </Card>
      </div>

      <section className="space-y-3">
        <SectionTitle title="Riders por sucursal" description="Controla vigencia mensual y renovaciones de tus riders afiliados." />
        <div className="grid gap-4">
          {branches.map((branch) => (
            <BranchRidersPanel branch={branch} key={branch.restaurantId} qrConfigured={Boolean(payment.qrUrl)} />
          ))}
        </div>
      </section>
    </div>
  );
}

function BranchRidersPanel({ branch, qrConfigured }: { branch: OwnerRiderBranch; qrConfigured: boolean }) {
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-[var(--color-heading)]">{branch.restaurantName}</h2>
          <p className="mt-1 text-sm font-semibold text-[var(--color-secondary-text)]">
            {branch.riders.length} rider{branch.riders.length === 1 ? "" : "s"} afiliado{branch.riders.length === 1 ? "" : "s"}
          </p>
        </div>
        <Badge className="bg-[var(--primary-light)] text-[var(--primary)]">{branch.restaurantCity || "Sucursal"}</Badge>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {branch.riders.map((rider) => {
          const latestRenewal = branch.renewalRequests.find((renewal) => renewal.restaurantRiderId === rider.id);
          return <OwnerRiderCard key={rider.id} latestRenewal={latestRenewal} qrConfigured={qrConfigured} rider={rider} />;
        })}
        {!branch.riders.length ? (
          <div className="rounded-2xl border border-dashed border-[var(--border)] p-5 text-sm font-semibold text-[var(--color-secondary-text)]">
            Aun no hay riders aprobados para esta sucursal.
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function OwnerRiderCard({
  latestRenewal,
  qrConfigured,
  rider,
}: {
  latestRenewal?: RiderRenewalRequest;
  qrConfigured: boolean;
  rider: RestaurantRider;
}) {
  const expired = isRiderExpired(rider);
  const pendingRenewal = rider.hasPendingRenewal || latestRenewal?.status === "submitted";
  const disabled = pendingRenewal || !qrConfigured;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-black text-[var(--color-heading)]">{rider.fullName}</p>
            <RiderStatusBadge expired={expired} status={rider.status} />
          </div>
          <p className="mt-1 text-sm font-semibold text-[var(--color-secondary-text)]">{rider.phone}</p>
        </div>
        <Badge className="bg-white text-[var(--primary)]">{rider.plateNumber}</Badge>
      </div>

      <div className="mt-4 grid gap-2 text-sm font-semibold text-[var(--color-body)]">
        <p>CI: <strong>{rider.documentNumber}</strong></p>
        <p>RUAT: <strong>{rider.ruatNumber}</strong></p>
        <p>Vence: <strong>{formatShortDate(rider.membershipValidUntil)}</strong></p>
      </div>

      {latestRenewal ? (
        <div className="mt-4 rounded-xl border border-[var(--border)] bg-white p-3 text-sm font-semibold text-[var(--color-secondary-text)]">
          <div className="flex flex-wrap items-center gap-2">
            <ReceiptText className="h-4 w-4 text-[var(--primary)]" />
            <span>Ultima renovacion: {latestRenewal.status === "submitted" ? "pendiente" : latestRenewal.status === "approved" ? "aprobada" : "rechazada"}</span>
          </div>
          {latestRenewal.approvedValidUntil ? <p className="mt-1">Vigencia aprobada hasta {formatShortDate(latestRenewal.approvedValidUntil)}</p> : null}
        </div>
      ) : null}

      <form action={requestRiderRenewalAction} className="mt-4 space-y-3">
        <input name="restaurantId" type="hidden" value={rider.restaurantId} />
        <input name="restaurantRiderId" type="hidden" value={rider.id} />
        <CompressedImageInput
          acceptPdf
          className="rounded-xl border border-[var(--border)] bg-white p-3"
          help="Captura o PDF del pago mensual. Superadmin lo revisa antes de extender la membresia."
          label="Comprobante de renovacion"
          name="paymentProofFile"
          required
        />
        <FormSubmitButton
          className="w-full"
          disabled={disabled}
          label={pendingRenewal ? "Renovacion en revision" : "Enviar renovacion"}
          overlayDescription="Subiendo comprobante de renovacion rider."
          overlayTitle="Enviando comprobante"
          pendingLabel="Subiendo..."
        />
        {!qrConfigured ? (
          <p className="flex items-center gap-2 text-xs font-bold text-[var(--color-warning-strong)]">
            <AlertTriangle className="h-4 w-4" />
            Falta QR de pago configurado.
          </p>
        ) : null}
      </form>
    </div>
  );
}

function RiderStatusBadge({ expired, status }: { expired: boolean; status: RestaurantRider["status"] }) {
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
