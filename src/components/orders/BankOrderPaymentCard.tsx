"use client";

import { useCallback, useState } from "react";
import { useRealtimeBroadcast } from "@/lib/client/use-realtime-broadcast";
import { formatMoney } from "@/lib/utils/money";

type Payment = { available: boolean; status: string; amount?: number; image?: string | null; applicationState?: string };
export function BankOrderPaymentCard({ orderId, token, initialPayment }: { orderId: string; token: string; initialPayment: Payment | null }) {
  const [payment, setPayment] = useState<Payment | null>(initialPayment);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endpoint = `/api/payments/baneco/order?orderId=${encodeURIComponent(orderId)}`;
  const refresh = useCallback(async () => {
    try {
      const response = await fetch(endpoint, { cache: "no-store", headers: { "x-order-tracking-token": token } });
      if (response.ok) setPayment(await response.json());
    } catch { /* Reconnect resync and the server worker recover connectivity loss. */ }
  }, [endpoint, token]);
  useRealtimeBroadcast({ enabled: payment?.status !== "paid", topic: `bank-order-payment:${token}`, onChange: refresh, onSync: refresh });
  async function generate() {
    setBusy(true); setError("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "x-order-tracking-token": token } });
      if (response.ok) setPayment(await response.json());
      else { await refresh(); setError("No se pudo completar la emisión. Revisa el estado o contacta al local antes de volver a pagar."); }
    } catch { await refresh(); setError("Se interrumpió la conexión. Conservamos la solicitud; revisa su estado antes de volver a pagar."); }
    finally { setBusy(false); }
  }
  async function cancel() {
    if (!window.confirm("¿Anular este QR para cambiar la forma de pago? Primero comprobaremos si ya fue pagado.")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(endpoint, { method: "DELETE", headers: { "x-order-tracking-token": token } });
      if (response.ok) { const result = await response.json(); setPayment(result); if (result.status === "not_created") setError("QR anulado por el banco. Puedes coordinar otra forma de pago con el local."); }
      else setError("Hay una verificación en curso. Espera unos segundos antes de volver a anular.");
    } catch { setError("No pudimos confirmar la anulación. No cambies de pago hasta comprobar el estado."); }
    finally { setBusy(false); }
  }
  if (!payment?.available) return null;
  return <section className="my-4 min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4" aria-live="polite">
    <h2 className="text-lg font-black">{payment.status === "paid" ? "Pago confirmado" : "Paga tu pedido con QR"}</h2>
    {payment.status === "paid" ? <p className="mt-2 text-sm font-semibold text-emerald-700">Recibimos tu pago. Este QR es de uso único; no vuelvas a pagarlo.{payment.applicationState === "review" ? " El local revisará la aplicación del pago a tu pedido." : ""}</p> : <>
      {payment.amount !== undefined ? <p className="mt-2 text-xl font-black">{formatMoney(payment.amount, "BOB")}</p> : null}
      {payment.status === "not_created" ? <button disabled={busy} type="button" onClick={generate} className="mt-3 min-h-12 w-full rounded-xl bg-[var(--accent)] px-4 font-bold text-[var(--primary)]">{busy ? "Generando QR…" : "Generar QR de este pedido"}</button> : null}
      {payment.image && payment.status === "pending" ? <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="mx-auto my-3 aspect-square w-full max-w-64 rounded-xl object-contain" alt="QR de pago del pedido" src={payment.image} />
        <a className="flex min-h-11 items-center justify-center font-bold underline" href={payment.image} download={`yopido-pedido-${orderId}.png`}>Descargar QR</a>
        <button className="min-h-11 w-full text-sm font-semibold underline" type="button" disabled={busy} onClick={cancel}>Anular QR para cambiar de pago</button>
      </> : payment.status !== "not_created" ? <p className="mt-3 text-sm">{payment.status === "generating" ? "Estamos recuperando el QR de tu solicitud." : "La emisión necesita revisión del local. No generes otro pago."}</p> : null}
      <p className="mt-3 text-sm text-[var(--muted)]">La confirmación aparecerá aquí automáticamente. Puedes volver a esta pantalla si se interrumpe tu conexión.</p>
      {error ? <p className="mt-2 text-sm" role="alert">{error}</p> : null}
    </>}
  </section>;
}
