"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Copy, Download, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { useRealtimeBroadcast } from "@/lib/client/use-realtime-broadcast";
import { bankOrderIsSettled, mergeBankPayment, shouldAutoVerifyBankPayment, type BankOrderPaymentState as Payment } from "@/lib/payments/bank-order-state";
import { formatMoney } from "@/lib/utils/money";
import { BankPaymentProgress } from "./BankPaymentProgress";

type Operation = "generate" | "verify" | "cancel";
export function BankOrderPaymentCard({ orderId, token = "", initialPayment, staffRestaurantId, checkoutMode = false, autoGenerate = false, disabled = false, onSettled, onPaymentReceived, onStateChange, onBusyChange }: {
  orderId: string; token?: string; initialPayment: Payment | null; staffRestaurantId?: string; checkoutMode?: boolean; autoGenerate?: boolean; disabled?: boolean;
  onSettled?: () => void; onPaymentReceived?: () => void; onStateChange?: (payment: Payment) => void; onBusyChange?: (busy: boolean) => void;
}) {
  const [payment, setPayment] = useState<Payment | null>(initialPayment);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [error, setError] = useState(""), [syncError, setSyncError] = useState(""), [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const generationAttemptedRef = useRef(false), operationRef = useRef(false), mounted = useRef(true);
  const readController = useRef<AbortController | null>(null);
  const settledNotified = useRef(false), paidNotified = useRef(false);
  const acceptPayment = useCallback((next: Payment) => {
    if (mounted.current) setPayment(current => mergeBankPayment(current, next));
  }, []);
  const paymentRef = useRef(payment), lastAutoCheck = useRef(0);
  useEffect(() => { paymentRef.current = payment; }, [payment]);
  const settled = bankOrderIsSettled(payment);
  useEffect(() => { if (settled && onSettled && !settledNotified.current) { settledNotified.current = true; onSettled(); } }, [settled, onSettled]);
  useEffect(() => { if (payment?.status === "paid" && onPaymentReceived && !paidNotified.current) { paidNotified.current = true; onPaymentReceived(); } }, [payment?.status, onPaymentReceived]);
  useEffect(() => { if (payment) onStateChange?.(payment); }, [payment, onStateChange]);
  useEffect(() => { onBusyChange?.(Boolean(operation)); }, [operation, onBusyChange]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; readController.current?.abort(); }; }, []);
  const endpoint = staffRestaurantId ? `/api/mobile/pos/bank-qr?restaurantId=${encodeURIComponent(staffRestaurantId)}&orderId=${encodeURIComponent(orderId)}` : `/api/payments/baneco/order?orderId=${encodeURIComponent(orderId)}`;
  const refresh = useCallback(async () => {
    if (operationRef.current || readController.current) return;
    const controller = new AbortController(); readController.current = controller;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 12000);
    try {
      const checkBank = shouldAutoVerifyBankPayment(paymentRef.current, lastAutoCheck.current);
      if (checkBank) lastAutoCheck.current = Date.now();
      const response = await fetch(checkBank && !staffRestaurantId ? `${endpoint}&action=verify` : endpoint, {
        method: checkBank ? "POST" : "GET", cache: "no-store",
        headers: { "x-order-tracking-token": token, ...(checkBank && staffRestaurantId ? { "Content-Type": "application/json" } : {}) },
        body: checkBank && staffRestaurantId ? JSON.stringify({ restaurantId: staffRestaurantId, orderId, action: "verify" }) : undefined,
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("unavailable");
      const next = await response.json() as Payment;
      if (!controller.signal.aborted && mounted.current) { acceptPayment(next); setSyncError(""); }
    } catch {
      if ((!controller.signal.aborted || timedOut) && mounted.current) setSyncError("No pudimos actualizar el estado. Tu solicitud sigue guardada; volveremos a consultar automáticamente.");
    } finally {
      clearTimeout(timeout);
      if (readController.current === controller) readController.current = null;
    }
  }, [endpoint, token, acceptPayment, staffRestaurantId, orderId]);
  useEffect(() => {
    if (settled || payment?.orderStatus === "cancelled") return;
    const first = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 3000);
    const foreground = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("online", foreground);
    window.addEventListener("focus", foreground);
    document.addEventListener("visibilitychange", foreground);
    return () => { clearTimeout(first); clearInterval(timer); window.removeEventListener("online", foreground); window.removeEventListener("focus", foreground); document.removeEventListener("visibilitychange", foreground); };
  }, [refresh, settled, payment?.orderStatus]);
  const realtimeToken = payment?.realtimeToken || token;
  useRealtimeBroadcast({ enabled: Boolean(realtimeToken) && !settled, topic: `bank-order-payment:${realtimeToken}`, onChange: refresh, onSync: refresh });
  useRealtimeBroadcast({ enabled: checkoutMode && Boolean(realtimeToken), topic: `order-tracking:${realtimeToken}`, onChange: refresh, onSync: refresh });
  async function mutate(action: Operation) {
    if (operationRef.current || disabled) return;
    operationRef.current = true;
    readController.current?.abort(); readController.current = null;
    setOperation(action); setError(""); setNotice("");
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch(staffRestaurantId ? endpoint : `${endpoint}${action === "verify" ? "&action=verify" : ""}`, {
        method: action === "cancel" && !staffRestaurantId ? "DELETE" : "POST", signal: controller.signal,
        headers: staffRestaurantId ? { "Content-Type": "application/json" } : { "x-order-tracking-token": token },
        ...(staffRestaurantId ? { body: JSON.stringify({ restaurantId: staffRestaurantId, orderId, action }) } : {}),
      });
      if (!response.ok) throw new Error(response.status === 429 ? "busy" : "unavailable");
      const next = await response.json() as Payment;
      if (!mounted.current) return;
      acceptPayment(next); setSyncError("");
      if (action === "verify" && next.status !== "paid") setNotice(next.verificationPending
        ? "La comprobación sigue en curso. Seguiremos verificando automáticamente; tu pedido se enviará cuando el banco confirme el pago."
        : "Todavía no recibimos la confirmación del banco. Seguiremos verificando automáticamente; si ya pagaste, espera aquí sin volver a pagar.");
      if (action === "cancel" && next.status === "not_created") setNotice("QR anulado por el banco. No pagues una copia anterior. Puedes emitir uno nuevo para el mismo pedido.");
    } catch (caught) {
      if (mounted.current) setError(caught instanceof Error && caught.message === "busy" ? "Ya hay una consulta en curso. Espera unos segundos; seguimos revisando tu pago."
        : action === "verify" ? "La consulta tardó más de lo esperado o se perdió la conexión. Tu solicitud sigue guardada y volveremos a verificar; si ya pagaste, no vuelvas a pagar."
        : action === "cancel" ? "No pudimos confirmar la anulación. Verifica el estado antes de cambiar de pago."
        : "No pudimos completar la emisión. Conservamos la misma solicitud; verifica su estado antes de intentar de nuevo.");
    } finally {
      clearTimeout(timeout); operationRef.current = false;
      if (mounted.current) setOperation(null);
    }
  }
  useEffect(() => {
    if (!autoGenerate || disabled || generationAttemptedRef.current || !payment?.available || payment.status !== "not_created") return;
    generationAttemptedRef.current = true;
    void mutate("generate");
  });
  const busy = Boolean(operation) || disabled;
  if (!payment?.available && !staffRestaurantId && !checkoutMode) return null;
  const status = payment?.status ?? "not_created";
  const received = status === "paid", cancelled = payment?.orderStatus === "cancelled";
  return <section className="min-w-0 space-y-4" aria-label="Pago con QR">
    {checkoutMode ? <BankPaymentProgress payment={payment} generating={operation === "generate"} /> : null}
    {!cancelled ? <div className="min-w-0 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
      {!checkoutMode ? <h2 className="text-lg font-black">{received ? settled ? "Pago confirmado" : "Pago recibido · Confirmando pedido" : "Paga tu pedido con QR"}</h2> : null}
      {payment?.collectionRoute === "platform" ? <p className="mt-2 text-sm text-[var(--muted)]">Yopido recibe este pago por cuenta del local.</p> : null}
      {received ? <p className="flex items-start gap-2 text-sm font-semibold leading-6 text-[var(--color-success-strong)]"><CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0" /><span>Recibimos tu pago. No vuelvas a pagar.{payment?.applicationState === "review" ? " Conserva esta pantalla mientras el restaurante revisa el pago." : !settled ? " Estamos terminando de registrar el pedido automáticamente." : " El avance de tu pedido aparecerá en su seguimiento."}</span></p> : <>
        {payment?.amount !== undefined ? <div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold text-[var(--muted)]">Total a pagar</span><strong className="text-2xl font-black text-[var(--text)]">{formatMoney(payment.amount, "BOB")}</strong></div> : null}
        {payment?.image && status === "pending" ? <>
          <div className="mx-auto my-4 w-full max-w-72 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="aspect-square w-full object-contain" alt="QR de pago del pedido" src={payment.image} />
          </div>
          <p className="text-center text-sm font-semibold text-[var(--text)]">Escanea el QR desde tu banco o descárgalo</p>
          <a className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border)] px-4 text-sm font-bold" href={payment.image} download={`yopido-pedido-${orderId}.png`}><Download aria-hidden="true" className="size-4 shrink-0" />Descargar QR</a>
          {!checkoutMode ? <button className="mt-2 min-h-11 w-full text-sm font-semibold underline disabled:opacity-50" type="button" disabled={busy} onClick={() => { if (window.confirm("¿Anular este QR? Primero comprobaremos si ya fue pagado. Esto no cancela el pedido.")) void mutate("cancel"); }}>Anular este QR</button> : null}
        </> : ["generating", "unknown"].includes(status) ? <p className="mt-4 flex items-center gap-2 text-sm leading-6"><LoaderCircle aria-hidden="true" className="size-5 shrink-0 animate-spin motion-reduce:animate-none" />Estamos recuperando el QR de esta solicitud. Puedes verificar su estado sin crear otro pago.</p> : null}
        {["not_created", "unavailable"].includes(status) && (payment?.available || staffRestaurantId) ? <button disabled={busy} type="button" onClick={() => void mutate("generate")} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-4 text-sm font-bold text-[var(--text)] disabled:opacity-50">{operation === "generate" ? <LoaderCircle aria-hidden="true" className="size-5 animate-spin motion-reduce:animate-none" /> : null}{operation === "generate" ? "Generando tu QR…" : "Generar QR de este pedido"}</button> : null}
        {checkoutMode && !payment?.available && !payment ? <p className="mt-3 text-sm text-[var(--muted)]">Estamos recuperando el estado de tu pago. Conserva esta página mientras volvemos a consultar.</p> : null}
        {!payment?.available && payment && checkoutMode ? <p className="mt-3 text-sm leading-6 text-amber-800">No encontramos un QR disponible. Conserva esta pantalla y consulta al restaurante antes de intentar otro pago.</p> : null}
      </>}
      {!settled ? <button className="mt-4 flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-black text-[#12355b] disabled:opacity-60" disabled={busy} type="button" onClick={() => void mutate("verify")}>{operation === "verify" ? <LoaderCircle aria-hidden="true" className="size-5 animate-spin motion-reduce:animate-none" /> : <RefreshCw aria-hidden="true" className="size-4" />}{operation === "verify" ? "Verificando con el banco…" : received ? "Comprobar mi pedido" : "Ya pagué · Verificar pago"}</button> : null}
      {notice && !received ? <p className="mt-3 rounded-2xl bg-[var(--primary-light)] p-3 text-sm leading-6 text-[var(--text)]" role="status">{notice}</p> : null}
      {error || syncError ? <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900" role="alert">{error || syncError}</p> : null}
      {!received ? <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-[var(--muted)]"><ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span>{staffRestaurantId ? "Muestra este QR al cliente. El banco confirma el pago antes de enviar el pedido." : "Tu pedido se enviará automáticamente cuando el banco confirme el pago. Puedes abrir tu banco y volver a esta misma pantalla."}</span></p> : null}
      {!staffRestaurantId ? <button className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 text-sm font-bold text-[var(--text)]" type="button" onClick={async () => {
        try { await navigator.clipboard.writeText(window.location.href); setCopied(true); }
        catch { setError("Conserva la dirección de esta página para volver al mismo pago."); }
      }}><Copy aria-hidden="true" className="size-4" />{copied ? "Enlace copiado" : "Guardar enlace de mi pedido"}</button> : null}
    </div> : null}
  </section>;
}
