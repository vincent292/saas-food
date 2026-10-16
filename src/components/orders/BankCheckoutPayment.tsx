"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BankOrderPaymentCard } from "./BankOrderPaymentCard";
import { useRealtimeBroadcast } from "@/lib/client/use-realtime-broadcast";
import { markOrderRecovered } from "@/lib/client/order-recovery";
import { publicRestaurantPath } from "@/lib/utils/public-routes";
type Payment = { available: boolean; status: string; amount?: number; image?: string | null; applicationState?: string; checkoutHeld?: boolean; scheduleHeld?: boolean; paymentStatus?: string; orderStatus?: string };
export function BankCheckoutPayment({ orderId, token, restaurantSlug, requestId, initialPayment }: {
  orderId: string; token: string; restaurantSlug: string; requestId: string | null; initialPayment: Payment | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [payment, setPayment] = useState(initialPayment);
  const endpoint = `/api/payments/baneco/order?orderId=${encodeURIComponent(orderId)}`;
  const refresh = useCallback(async () => {
    try {
      const response = await fetch(endpoint, { cache: "no-store", headers: { "x-order-tracking-token": token } });
      if (!response.ok) return;
      const next = await response.json() as Payment;
      setPayment(next);
      if (next.paymentStatus === "paid" && !next.checkoutHeld && next.orderStatus && next.orderStatus !== "cancelled" && (next.scheduleHeld || !["pending", "cancelled"].includes(next.orderStatus))) {
        router.replace(`${publicRestaurantPath(restaurantSlug, `pedido/${orderId}`)}?token=${encodeURIComponent(token)}`);
      }
    } catch { /* The same durable reservation is recovered after reconnect. */ }
  }, [endpoint, token, restaurantSlug, orderId, router]);
  useRealtimeBroadcast({ topic: `order-tracking:${token}`, onChange: refresh, onSync: refresh });
  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 5000);
    const foreground = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", foreground);
    window.addEventListener("online", foreground);
    return () => { clearTimeout(first); clearInterval(timer); document.removeEventListener("visibilitychange", foreground); window.removeEventListener("online", foreground); };
  }, [refresh]);
  async function abandon() {
    if (!window.confirm("¿Cancelar esta solicitud? Primero verificaremos y anularemos su QR. Si ya se pagó, no se cancelará ni se creará otro pedido.")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(endpoint + "&abandon=1", { method: "DELETE", headers: { "x-order-tracking-token": token } });
      if (!response.ok || !(await response.json()).abandoned) throw new Error("not-cancelled");
      if (requestId) { try { markOrderRecovered(requestId, true); } catch { /* Cancellation is already durable server-side. */ } }
      window.location.assign(publicRestaurantPath(restaurantSlug));
    } catch { await refresh(); setError("No pudimos confirmar la cancelación. Conservamos esta misma solicitud; no vuelvas a pagar ni crees otra hasta revisar su estado."); }
    finally { setBusy(false); }
  }
  const received = payment?.status === "paid";
  const cancelled = payment?.orderStatus === "cancelled";
  return <div className="space-y-4">
    <div className="rounded-2xl bg-[var(--accent-soft)] p-4 text-sm text-[var(--primary)]" role="status">
      {cancelled ? "Solicitud cancelada. No se envió al local." : received
        ? payment?.applicationState === "review" ? "El banco confirmó el pago, pero su aplicación requiere revisión. No vuelvas a pagar. Contacta al local con esta referencia." : "Pago confirmado. Estamos enviando y aprobando tu pedido automáticamente…"
        : "Todavía no enviamos tu pedido al local. Primero paga este QR; al confirmar el banco, lo enviaremos aprobado automáticamente."}
    </div>
    {!cancelled && !received && !payment?.available ? <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">No pudimos recuperar un QR disponible. Conserva esta pantalla y contacta al local si persiste; no crees otra solicitud ni pagues una copia anterior.</p> : null}
    {!cancelled ? <BankOrderPaymentCard key={`${payment?.status}:${payment?.applicationState}`} orderId={orderId} token={token} initialPayment={payment} checkoutMode /> : null}
    <p className="text-sm text-[var(--muted)]">Puedes salir a tu banco y volver a esta pantalla. Recuperaremos la misma solicitud y el mismo QR, sin crear otro pedido. Si no pagas, no entra a caja ni cocina.</p>
    {!received && !cancelled ? <button className="min-h-12 w-full rounded-xl border border-[var(--border)] px-4 text-sm font-bold" disabled={busy} type="button" onClick={() => void abandon()}>{busy ? "Comprobando con el banco…" : "Cancelar solicitud y volver al menú"}</button> : null}
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
  </div>;
}
