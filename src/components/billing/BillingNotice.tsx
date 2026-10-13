import Link from "next/link";
import { getMyBillingAccounts } from "@/lib/services/billing-notice.service";
import type { OwnerBillingSnapshot } from "@/lib/services/owner-billing.service";
import { submitBillingPromiseAction } from "@/app/admin/billing-actions";
import { QrPaymentViewer } from "@/components/payments/QrPaymentViewer";
import { Input, Textarea } from "@/components/ui/Input";
import { FormSubmitButton } from "@/components/ui/FormSubmitButton";
import { formatMoney } from "@/lib/utils/money";
import { BillingNoticeRefresh } from "./BillingNoticeRefresh";

export async function BillingNotices({ restaurantId, full = false }: { restaurantId?: string; full?: boolean }) {
  const accounts = await getMyBillingAccounts(restaurantId);
  return <div className="space-y-4">{accounts.length ? <BillingNoticeRefresh /> : null}{accounts.map(({ ownerId, name, billing, isOwner }) => billing && (full || billing.showNotice) ?
    <BillingNotice key={ownerId} name={name} billing={billing} isOwner={isOwner} full={full} /> : null)}</div>;
}

function BillingNotice({ name, billing, isOwner, full }: { name: string; billing: OwnerBillingSnapshot; isOwner: boolean; full: boolean }) {
  const cycle = billing.currentCycle;
  if (billing.isPaid) return full ? <section className="rounded-2xl border border-[var(--border)] p-4"><h2 className="font-black">{name}: sin pago pendiente para este ciclo</h2><p className="text-sm">Próximo vencimiento: {billing.settings.nextDueDate}. Los avisos volverán cuando corresponda.</p></section> : null;
  return <section role="status" className="my-4 rounded-2xl border border-[var(--border)] bg-[var(--color-warning-soft)] p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><p className="text-xs font-black uppercase">Mensualidad · {name}</p>
        <h2 className="mt-1 text-lg font-black">{billing.isOverdue ? "Acceso suspendido por mensualidad pendiente" : billing.daysUntilDue > 0 ? `Tu mensualidad vence en ${billing.daysUntilDue} día${billing.daysUntilDue === 1 ? "" : "s"}` : billing.daysUntilDue === 0 ? "Tu mensualidad vence hoy" : "Mensualidad vencida · regulariza tu pago"}</h2>
        <p className="mt-2 text-sm">{formatMoney(cycle.amountDue, cycle.currency)} · Vence {cycle.dueDate}. {billing.isOverdue ? "Contacta al responsable para regularizar el acceso." : `Paga hasta ${billing.cutoffDate} para evitar el corte; después de esa fecha se suspenderá el acceso.`}</p>
        {cycle.proofUploadedAt && !cycle.paidAt ? <p className="mt-2 text-sm font-bold">Comprobante recibido: pendiente de aprobación. No cuenta como pago aprobado.</p> : null}
        {cycle.paymentPromiseStatus === "pending" ? <p className="mt-2 text-sm font-bold">Solicitaste pagar el {cycle.paymentPromisedOn}. Pendiente de aprobación: no modifica el corte actual.</p> : null}
        {cycle.paymentPromiseStatus === "rejected" ? <p className="mt-2 text-sm font-bold">La última fecha propuesta no fue aprobada. Puedes enviar otra solicitud.</p> : null}
        {cycle.paymentExtensionUntil ? <p className="mt-2 text-sm font-bold">Prórroga aprobada para este ciclo hasta {cycle.paymentExtensionUntil}. No es un pago ni modifica los meses siguientes.</p> : null}
      </div>
      {billing.settings.platformQrUrl ? <QrPaymentViewer url={billing.settings.platformQrUrl} title="QR de mensualidad" imageClassName="h-28 w-28" subtitle={billing.settings.platformQrNote} /> : <p className="text-sm font-bold">El superadmin debe configurar el QR de mensualidad.</p>}
    </div>
    {isOwner ? <Link href="/dueno/plan" className="mt-3 inline-block text-sm font-black underline">Enviar o revisar comprobante de pago</Link> : <p className="mt-3 text-sm">El dueño puede enviar el comprobante desde su sección Plan.</p>}
    <details className="mt-4"><summary className="cursor-pointer text-sm font-black">¿Hasta cuándo puedes pagar?</summary>
      <form action={submitBillingPromiseAction} className="mt-3 grid max-w-lg gap-3">
        <input type="hidden" name="cycleId" value={cycle.id} />
        <label className="grid gap-1 text-sm font-bold">Fecha propuesta<Input required type="date" name="promisedOn" defaultValue={cycle.paymentPromisedOn} /></label>
        <Textarea name="note" maxLength={1000} placeholder="Explica cuándo podrás pagar (opcional)" />
        <p className="text-xs">Solicitar una fecha no evita el corte: el superadmin debe aprobarla.</p>
        <FormSubmitButton label="Enviar fecha propuesta" pendingLabel="Enviando..." overlayTitle="Enviando solicitud" overlayDescription="La fecha queda pendiente de aprobación." />
      </form>
    </details>
  </section>;
}
