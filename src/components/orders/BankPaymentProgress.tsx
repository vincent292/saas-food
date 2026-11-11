"use client";

import { Check, CheckCircle2, Clock3, LoaderCircle, QrCode, ShieldCheck, TriangleAlert } from "lucide-react";
import { bankCheckoutIsSubmitted, type BankOrderPaymentState } from "@/lib/payments/bank-order-state";

export function BankPaymentProgress({ payment, generating = false }: { payment: BankOrderPaymentState | null; generating?: boolean }) {
  const paid = payment?.status === "paid";
  const review = payment?.applicationState === "review" || payment?.status === "review";
  const complete = bankCheckoutIsSubmitted(payment);
  const cancelled = payment?.orderStatus === "cancelled";
  const expired = payment?.status === "expired";
  const waiting = !cancelled && !review && !expired && !complete;
  const title = cancelled ? "Solicitud cancelada" : review ? "Tu pago necesita revisión" : expired ? "Este QR venció"
    : complete ? "¡Tu pedido está confirmado!" : paid ? "Pago recibido. Enviando tu pedido…"
    : generating || !payment || payment.status === "generating" ? "Estamos preparando tu QR…" : "Esperando tu pago";
  const description = cancelled ? "Esta solicitud ya no se enviará al restaurante."
    : review ? paid ? "El banco recibió tu pago. Contacta al restaurante para revisar su aplicación; conserva esta pantalla y no vuelvas a pagar." : "Conserva esta pantalla y consulta al restaurante antes de intentar otro pago."
    : expired ? "Verifica el estado antes de volver a pagar. Si ya hiciste el pago, conserva esta pantalla y contacta al restaurante."
    : complete ? payment?.scheduleHeld ? "Guardamos tu pedido para el horario elegido." : "El restaurante ya puede recibir tu pedido. Abriendo el seguimiento…"
    : paid ? "No vuelvas a pagar. Estamos confirmando tu pedido automáticamente; mantén esta página abierta."
    : "No cierres esta página. Puedes abrir tu banco y volver: enviaremos tu pedido automáticamente cuando se confirme el pago.";
  const textTone = review || expired ? "text-amber-950" : complete ? "text-emerald-950" : "text-[var(--text)]";
  const Icon = complete ? CheckCircle2 : review || expired ? TriangleAlert : cancelled ? Clock3 : LoaderCircle;
  const steps = ["QR listo", "Pago confirmado", payment?.scheduleHeld ? "Pedido programado" : "Pedido enviado"];
  const current = complete ? 3 : paid ? 2 : payment?.image ? 1 : 0;
  return <section aria-label="Estado de tu pago" className={`overflow-hidden rounded-3xl border p-4 sm:p-5 ${review || expired ? "border-amber-200 bg-amber-50" : complete ? "border-emerald-200 bg-emerald-50" : "border-[var(--border)] bg-[var(--primary-light)]"}`}>
    <div className="flex items-start gap-3">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/90 text-[var(--primary)]"><Icon aria-hidden="true" className={`size-6 ${waiting ? "animate-spin motion-reduce:animate-none" : ""}`} /></span>
      <div role="status" aria-live="polite" aria-atomic="true" className="min-w-0">
        <h2 className={`text-base font-black leading-6 sm:text-lg ${textTone}`}>{title}</h2>
        <p className={`mt-1 text-sm leading-6 ${textTone}`}>{description}</p>
      </div>
    </div>
    {!cancelled ? <ol aria-label="Pasos del pago" className="mt-5 grid grid-cols-3 gap-2 border-t border-[var(--border)] pt-4">
      {steps.map((step, index) => <li key={step} aria-current={index === current && !complete ? "step" : undefined} className="min-w-0 text-center">
        <span className={`mx-auto flex size-7 items-center justify-center rounded-full ${index < current ? "bg-[var(--primary)] text-white" : "bg-white text-[var(--muted)]"}`}>{index < current ? <Check aria-hidden="true" className="size-4" /> : index === 0 ? <QrCode aria-hidden="true" className="size-3.5" /> : <span className="text-xs font-bold">{index + 1}</span>}</span>
        <span className={`mt-2 block break-words text-[11px] font-bold leading-4 sm:text-xs ${textTone}`}>{step}</span>
      </li>)}
    </ol> : null}
    {!cancelled && !review && !expired ? <p className="mt-4 flex items-center justify-center gap-1.5 text-xs font-semibold text-[var(--muted)]"><ShieldCheck aria-hidden="true" className="size-4 shrink-0" />Confirmación directa del banco</p> : null}
  </section>;
}
