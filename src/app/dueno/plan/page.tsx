import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Clock3, ExternalLink, Plus, ReceiptText, Upload, WalletCards } from "lucide-react";
import { submitOwnerBillingPaymentProofAction } from "@/app/admin/actions";
import { OwnerLayout, getOwnerLayoutContext } from "@/components/layout/OwnerLayout";
import { CompressedImageInput } from "@/components/settings/CompressedImageInput";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormSubmitButton } from "@/components/ui/FormSubmitButton";
import { Input, Textarea } from "@/components/ui/Input";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { ownerBillingService, type OwnerBillingCycle } from "@/lib/services/owner-billing.service";
import { getOwnerBranchCapacity } from "@/lib/services/owner-dashboard.service";
import { formatMoney } from "@/lib/utils/money";

const planErrors: Record<string, string> = {
  "invalid-owner-billing-proof": "El comprobante debe ser imagen o PDF de hasta 5 MB.",
  "owner-billing-cycle-mismatch": "El ciclo cambio. Actualiza la pagina e intenta de nuevo.",
  "owner-billing-cycle-paid": "Este mes ya esta marcado como pagado.",
  "owner-billing-not-configured": "Aun falta configurar el QR de pago de la plataforma.",
  "owner-billing-proof-required": "Debes subir un comprobante de pago.",
  "owner-billing-proof-upload": "No se pudo subir el comprobante. Intenta con otro archivo.",
  "service-role-required": "Falta la clave de servicio para guardar comprobantes.",
};

export default async function OwnerPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ billing?: string; error?: string; paymentUploaded?: string }>;
}) {
  const [{ billing: billingFlag, error, paymentUploaded }, { ownerMemberships, profile }] = await Promise.all([
    searchParams,
    getOwnerLayoutContext({ active: "/dueno/plan" }),
  ]);
  const [capacity, billing] = await Promise.all([
    getOwnerBranchCapacity(ownerMemberships),
    ownerBillingService.getSnapshot(profile.id, { actorUserId: profile.id, enforce: true }),
  ]);
  const usedBranches = billing?.branchCount ?? capacity.used;
  const monthlyTotal = billing?.monthlyTotal ?? capacity.monthlyTotal;
  const remaining = Math.max(0, capacity.limit - usedBranches);
  const currentCycle = billing?.currentCycle;
  const paymentBlocked = !billing?.isConfigured || Boolean(currentCycle?.paidAt);

  return (
    <OwnerLayout active="/dueno/plan" memberships={ownerMemberships} title="Tarifa">
      <div className="space-y-6">
        {billingFlag === "overdue" ? (
          <Banner tone="danger">
            Tu mensualidad esta vencida. El panel operativo queda restringido hasta que el pago sea aprobado por superadmin.
          </Banner>
        ) : null}
        {paymentUploaded ? <Banner tone="success">Comprobante enviado. Te avisaremos cuando el superadmin apruebe el pago.</Banner> : null}
        {error ? <Banner tone="danger">{planErrors[error] ?? "No se pudo procesar el pago de plataforma."}</Banner> : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <Card>
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--primary-light)] text-[var(--primary)]">
              <WalletCards className="h-5 w-5" />
            </span>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-2xl font-black">Tarifa {billing?.planName ?? capacity.planName}</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-[var(--color-secondary-text)]">
                  Todo incluido para cada sucursal no archivada: pedidos, cocina, caja, inventario, reportes, soporte y configuracion.
                </p>
              </div>
              <BillingStatusBadge cycle={currentCycle} overdue={Boolean(billing?.isOverdue)} />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-4">
              <PriceMetric label="Primera sucursal" value={formatMoney(billing?.primaryPriceMonthly ?? capacity.primaryPriceMonthly)} />
              <PriceMetric label="Sucursal adicional" value={formatMoney(billing?.additionalPriceMonthly ?? capacity.additionalPriceMonthly)} />
              <PriceMetric label="Sucursales cobradas" value={String(usedBranches)} />
              <PriceMetric label="Total a pagar" value={formatMoney(monthlyTotal, billing?.settings.currency)} />
            </div>
            <div className="mt-5 h-3 overflow-hidden rounded-full bg-[var(--primary-light)]">
              <span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.min(100, (usedBranches / Math.max(1, capacity.limit)) * 100)}%` }} />
            </div>
          </Card>

          <Card className="flex flex-col justify-between gap-5">
            <div>
              <Badge className="bg-[var(--primary-light)] text-[var(--primary)]">Capacidad</Badge>
              <p className="mt-4 text-4xl font-black">{usedBranches}/{capacity.limit}</p>
              <p className="mt-1 text-sm font-semibold text-[var(--color-secondary-text)]">
                {remaining} sucursal{remaining === 1 ? "" : "es"} disponible{remaining === 1 ? "" : "s"}
              </p>
            </div>
            {remaining > 0 ? (
              <Link className={buttonClasses("primary")} href="/dueno/sucursales/nueva">
                <Plus className="h-4 w-4" />
                Crear sucursal
              </Link>
            ) : (
              <Link className={buttonClasses("primary")} href="/dueno/soporte">
                Solicitar otra sucursal
              </Link>
            )}
          </Card>
        </div>

        {billing && currentCycle ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <Card className="space-y-4">
              <SectionTitle
                title="Mensualidad actual"
                description={`Ciclo ${currentCycle.periodKey}. Debe pagarse hasta el ${formatDate(currentCycle.dueDate)}.`}
              />
              <div className="grid gap-3 sm:grid-cols-3">
                <SmallStat label="Vence" value={formatDate(currentCycle.dueDate)} />
                <SmallStat label="Dias" value={billing.daysUntilDue < 0 ? `${Math.abs(billing.daysUntilDue)} venc.` : String(billing.daysUntilDue)} />
                <SmallStat label="Monto" value={formatMoney(currentCycle.amountDue, currentCycle.currency)} />
              </div>

              {currentCycle.proofUrl ? (
                <a className="inline-flex items-center gap-2 text-sm font-black text-[var(--primary)]" href={currentCycle.proofUrl} rel="noreferrer" target="_blank">
                  <ReceiptText className="h-4 w-4" />
                  Ver comprobante enviado
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}

              <form action={submitOwnerBillingPaymentProofAction} className="grid gap-4 md:grid-cols-2">
                <input name="ownerBillingDueDate" type="hidden" value={currentCycle.dueDate} />
                <Input disabled value={formatMoney(currentCycle.amountDue, currentCycle.currency)} />
                <Input disabled value={billing.isConfigured ? "QR disponible" : "QR pendiente"} />
                <div className="md:col-span-2">
                  <CompressedImageInput
                    acceptPdf
                    help="Sube captura o PDF del pago mensual. El superadmin debe aprobarlo para reactivar la operacion."
                    label="Comprobante de pago"
                    name="ownerBillingPaymentProofFile"
                    required
                  />
                </div>
                <Textarea className="md:col-span-2" name="ownerBillingPaymentNotes" placeholder="Referencia, banco o numero de transaccion" />
                <div className="md:col-span-2">
                  <FormSubmitButton
                    className="w-full sm:w-auto"
                    disabled={paymentBlocked}
                    label={currentCycle.proofUrl ? "Reenviar comprobante" : "Enviar comprobante"}
                    overlayDescription="Subiendo evidencia del pago mensual."
                    overlayTitle="Enviando comprobante"
                    pendingLabel="Subiendo..."
                  />
                  {paymentBlocked ? <p className="mt-2 text-xs font-bold text-[var(--color-secondary-text)]">El formulario se procesa solo si hay QR configurado y el ciclo no esta pagado.</p> : null}
                </div>
              </form>
            </Card>

            <Card className="space-y-4">
              <SectionTitle title="QR de pago" description="Usa este QR para pagar la mensualidad de la plataforma." />
              {billing.settings.platformQrUrl ? (
                <a className="block overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-white" href={billing.settings.platformQrUrl} rel="noreferrer" target="_blank">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt="QR de pago mensual" className="aspect-square w-full object-cover" src={billing.settings.platformQrUrl} />
                </a>
              ) : (
                <div className="grid aspect-square place-items-center rounded-[var(--radius-card)] border border-dashed border-[var(--border)] bg-[var(--color-neutral-50)] text-sm font-bold text-[var(--color-secondary-text)]">
                  QR pendiente
                </div>
              )}
              <p className="rounded-[var(--radius-card)] bg-[var(--color-surface)] p-3 text-sm font-semibold leading-6 text-[var(--color-secondary-text)]">
                {billing.settings.platformQrNote || "Cuando pagues, sube el comprobante para que el superadmin lo apruebe."}
              </p>
            </Card>
          </div>
        ) : (
          <Banner tone="danger">No se pudo preparar el ciclo de cobro. Revisa la configuracion de servicio.</Banner>
        )}

        {billing?.recentCycles.length ? (
          <section className="space-y-3">
            <SectionTitle title="Historial mensual" description="Cada mes queda registrado con monto, vencimiento y comprobante." />
            <div className="grid gap-3">
              {billing.recentCycles.map((cycle) => (
                <Card className="grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-center" key={cycle.id}>
                  <CycleIcon cycle={cycle} />
                  <div>
                    <p className="font-black">{monthLabel(cycle.periodKey)}</p>
                    <p className="mt-1 text-sm font-semibold text-[var(--color-secondary-text)]">
                      {formatMoney(cycle.amountDue, cycle.currency)} hasta {formatDate(cycle.dueDate)} · {cycle.branchCount} sucursal{cycle.branchCount === 1 ? "" : "es"}
                    </p>
                    {cycle.proofUrl ? (
                      <a className="mt-2 inline-flex items-center gap-1 text-sm font-black text-[var(--primary)]" href={cycle.proofUrl} rel="noreferrer" target="_blank">
                        Comprobante
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : null}
                  </div>
                  <BillingStatusBadge cycle={cycle} overdue={cycle.status === "overdue"} />
                </Card>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </OwnerLayout>
  );
}

function PriceMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-4">
      <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-xl font-black text-[var(--color-heading)]">{value}</p>
      <p className="text-xs font-bold text-[var(--color-secondary-text)]">mensual</p>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[var(--color-surface)] p-4">
      <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-xl font-black text-[var(--color-heading)]">{value}</p>
    </div>
  );
}

function Banner({ children, tone }: { children: ReactNode; tone: "danger" | "success" }) {
  const className =
    tone === "success"
      ? "border-[var(--color-success)] bg-[var(--color-success-soft)] text-[var(--color-success-strong)]"
      : "border-[var(--color-danger)] bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]";

  return (
    <div className={`flex gap-3 rounded-[var(--radius-card)] border p-4 text-sm font-bold ${className}`}>
      {tone === "success" ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />}
      {children}
    </div>
  );
}

function BillingStatusBadge({ cycle, overdue }: { cycle?: OwnerBillingCycle; overdue: boolean }) {
  const status = cycle?.paidAt ? "paid" : overdue ? "overdue" : cycle?.status;
  const label =
    status === "paid"
      ? "Pagado"
      : status === "proof_uploaded"
        ? "En revision"
        : status === "verified"
          ? "Verificado"
          : status === "overdue"
            ? "Vencido"
            : "Pendiente";
  const className =
    status === "paid"
      ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]"
      : status === "overdue"
        ? "bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]"
        : "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]";

  return <Badge className={className}>{label}</Badge>;
}

function CycleIcon({ cycle }: { cycle: OwnerBillingCycle }) {
  if (cycle.paidAt) {
    return <CheckCircle2 className="h-5 w-5 text-[var(--color-success-strong)]" />;
  }

  if (cycle.status === "overdue") {
    return <AlertTriangle className="h-5 w-5 text-[var(--color-danger-strong)]" />;
  }

  if (cycle.proofUploadedAt) {
    return <Upload className="h-5 w-5 text-[var(--color-warning-strong)]" />;
  }

  return <Clock3 className="h-5 w-5 text-[var(--color-warning-strong)]" />;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-BO", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function monthLabel(periodKey: string) {
  return new Intl.DateTimeFormat("es-BO", { month: "long", year: "numeric" }).format(new Date(`${periodKey}-01T00:00:00`));
}
