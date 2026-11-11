"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BankOrderPaymentCard } from "./BankOrderPaymentCard";
import { markOrderRecovered } from "@/lib/client/order-recovery";
import { bankCheckoutIsSubmitted, mergeBankPayment, type BankOrderPaymentState as Payment } from "@/lib/payments/bank-order-state";
import { publicRestaurantPath } from "@/lib/utils/public-routes";

export function BankCheckoutPayment({ orderId, token, restaurantSlug, requestId, initialPayment }: {
  orderId: string; token: string; restaurantSlug: string; requestId: string | null; initialPayment: Payment | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [checking, setChecking] = useState(false), [error, setError] = useState("");
  const [payment, setPayment] = useState(initialPayment);
  const redirected = useRef(false), cancelling = useRef(false);
  const onStateChange = useCallback((next: Payment) => {
    setPayment(current => mergeBankPayment(current, next));
    if (bankCheckoutIsSubmitted(next) && !redirected.current) {
      redirected.current = true;
      router.replace(`${publicRestaurantPath(restaurantSlug, `pedido/${orderId}`)}?token=${encodeURIComponent(token)}`);
    }
  }, [restaurantSlug, orderId, token, router]);
  async function abandon() {
    if (cancelling.current || checking) return;
    if (!window.confirm("¿Cancelar esta solicitud? Primero verificaremos y anularemos su QR. Si ya se pagó, no se cancelará ni se creará otro pedido.")) return;
    cancelling.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/payments/baneco/order?orderId=${encodeURIComponent(orderId)}&abandon=1`, { method: "DELETE", headers: { "x-order-tracking-token": token } });
      if (!response.ok || !(await response.json()).abandoned) throw new Error("not-cancelled");
      if (requestId) { try { markOrderRecovered(requestId, true); } catch { /* Cancellation is already durable server-side. */ } }
      window.location.assign(publicRestaurantPath(restaurantSlug));
    } catch { setError("No pudimos confirmar la cancelación. Conservamos esta misma solicitud; revisa su estado antes de pagar de nuevo o crear otra."); }
    finally { cancelling.current = false; setBusy(false); }
  }
  const received = payment?.status === "paid" || payment?.paymentStatus === "paid";
  const cancelled = payment?.orderStatus === "cancelled";
  return <div className="space-y-4">
    <BankOrderPaymentCard orderId={orderId} token={token} initialPayment={initialPayment} checkoutMode autoGenerate disabled={busy} onStateChange={onStateChange} onBusyChange={setChecking} />
    <p className="px-2 text-center text-xs leading-5 text-[var(--muted)]">Tu solicitud queda guardada en esta página. Al volver de tu banco, continuaremos comprobando el mismo pago automáticamente.</p>
    {!received && !cancelled ? <button className="min-h-11 w-full rounded-xl px-4 text-sm font-semibold text-[var(--muted)] disabled:opacity-50" disabled={busy || checking} type="button" onClick={() => void abandon()}>{busy ? "Comprobando con el banco…" : "Cancelar solicitud y volver al menú"}</button> : null}
    {error ? <p role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">{error}</p> : null}
  </div>;
}
