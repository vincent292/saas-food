"use client";

import { CheckCircle2, CreditCard, QrCode, Wallet, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cancelPosQrSaleAction, createPosSaleInPlaceAction } from "@/app/admin/actions";
import { BankOrderPaymentCard } from "@/components/orders/BankOrderPaymentCard";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { cn } from "@/lib/utils/cn";
import { formatMoney } from "@/lib/utils/money";
import { publicRestaurantPath } from "@/lib/utils/public-routes";
import type { OrderOrigin, PaymentMethodType } from "@/types/order.types";

export type PosCheckoutSession = {
  requestId: string; cartJson: string; total: number; totalItems: number;
  orderOrigin: OrderOrigin; orderType: "pos" | "pickup";
};
type Receipt = Extract<Awaited<ReturnType<typeof createPosSaleInPlaceAction>>, { ok: true }>["order"];

function saleError(error: string) {
  if (error.includes("insufficient-cash")) return "El efectivo recibido no cubre el total actualizado del pedido.";
  if (error.includes("no-open-session")) return "La caja está cerrada. Ábrela antes de cobrar.";
  if (error === "qr-unavailable") return "El QR bancario no está disponible en esta sucursal.";
  if (error === "cash-access-denied") return "Tu usuario no tiene permiso para cobrar en esta sucursal.";
  return "No se pudo completar la venta. Revisa la conexión e intenta de nuevo; recuperaremos el mismo pedido.";
}

export function PosCheckoutModal({ open, session, restaurantId, restaurantSlug, source, qrAvailable, hasKitchenFlow, onClose, onReserved, onCompleted }: {
  open: boolean; session: PosCheckoutSession; restaurantId: string; restaurantSlug: string;
  source: "caja" | "pedidos"; qrAvailable: boolean; hasKitchenFlow: boolean;
  onClose: () => void; onReserved: () => void; onCompleted: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const submittingRef = useRef(false);
  const submittedDataRef = useRef<FormData | null>(null);
  const completedRef = useRef(false);
  const [method, setMethod] = useState<PaymentMethodType>("cash");
  const [cashReceived, setCashReceived] = useState("");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [completed, setCompleted] = useState(false);
  const [paymentReceived, setPaymentReceived] = useState(false);
  const [error, setError] = useState("");
  const amountDue = receipt?.total ?? session.total;
  const received = Math.max(0, Number(cashReceived) || 0);
  const cashValid = cashReceived.trim() !== "" && received >= session.total;
  const change = Math.max(0, received - amountDue);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function complete() {
    if (completedRef.current) return;
    completedRef.current = true;
    setCompleted(true);
    onCompleted();
  }

  async function submit(formData: FormData) {
    if (submittingRef.current || receipt) return;
    submittingRef.current = true;
    setBusy(true); setError("");
    try {
      const submittedData = submittedDataRef.current ?? formData;
      submittedDataRef.current = submittedData;
      const result = await createPosSaleInPlaceAction(submittedData);
      if (!result.ok) { submittedDataRef.current = null; setUncertain(false); setError(saleError(result.error)); return; }
      setReceipt(result.order);
      setMethod(result.order.payment_method);
      onReserved();
      if (result.order.payment_method !== "qr") complete();
    } catch {
      // A lost response can follow a successful commit. Freeze this basket and
      // retry with the original idempotency key before accepting another sale.
      setUncertain(true); onReserved();
      setError("Se interrumpió la conexión. Pulsa Recuperar venta para consultar el mismo pedido antes de cobrar otra vez.");
    } finally { submittingRef.current = false; setBusy(false); }
  }

  return <dialog aria-labelledby="pos-checkout-title" ref={dialogRef}
    className="fixed inset-0 m-auto max-h-[94dvh] w-[calc(100%-1.5rem)] max-w-lg overflow-y-auto rounded-3xl bg-[var(--surface)] p-0 text-[var(--text)] shadow-2xl backdrop:bg-black/55 backdrop:backdrop-blur-sm"
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface)] p-5">
      <div><p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--primary)]">{completed ? "Venta completada" : receipt ? "Cobro QR" : "Cobrar pedido"}</p>
        <h2 id="pos-checkout-title" className="mt-1 text-2xl font-black">{completed ? "Pago confirmado" : formatMoney(amountDue)}</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">{receipt ? `Pedido ${receipt.order_number}` : `${session.totalItems} productos · ${session.orderType === "pickup" ? "Para llevar" : "Mostrador / local"}`}</p>
      </div>
      <button aria-label="Cerrar cobro" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--color-surface)] disabled:opacity-40" disabled={busy} onClick={onClose} type="button"><X className="h-5 w-5" /></button>
    </div>
    <div className="p-5">
      {completed ? <div className="space-y-4">
        <div className="rounded-2xl bg-[var(--color-success-soft)] p-5 text-center text-[var(--color-success-strong)]"><CheckCircle2 className="mx-auto h-10 w-10" /><p className="mt-3 text-lg font-black">{hasKitchenFlow ? "Pedido enviado a cocina" : "Venta registrada"}</p><p className="mt-1 text-sm font-semibold">{formatMoney(amountDue)}{method === "cash" ? ` · Cambio: ${formatMoney(change)}` : " · Pagado"}</p></div>
        {receipt ? <a className="flex min-h-11 items-center justify-center text-sm font-bold underline" href={`${publicRestaurantPath(restaurantSlug, `pedido/${receipt.id}`)}?token=${encodeURIComponent(receipt.tracking_token ?? "")}`} target="_blank" rel="noreferrer">Abrir seguimiento del cliente</a> : null}
        <Button className="w-full" onClick={onClose} type="button">Nueva venta</Button>
      </div> : receipt ? <>
        <ol className="flex justify-between gap-2 rounded-xl bg-[var(--color-surface)] p-3 text-xs font-bold"><li>1. Mostrar QR</li><li>2. Confirmar pago</li><li>3. {hasKitchenFlow ? "Enviar a cocina" : "Registrar venta"}</li></ol>
        <BankOrderPaymentCard orderId={receipt.id} token={receipt.tracking_token ?? ""} initialPayment={null} staffRestaurantId={restaurantId} autoGenerate onSettled={complete} onPaymentReceived={() => setPaymentReceived(true)} checkoutMode />
        <p className="text-center text-xs font-semibold text-[var(--muted)]">Puedes cerrar y retomar este cobro. El pedido se enviará automáticamente cuando el banco confirme.</p>
        {!paymentReceived ? <button className="mt-3 min-h-11 w-full text-sm font-bold text-[var(--color-danger-strong)] disabled:opacity-40" disabled={busy} onClick={async () => {
          if (!window.confirm("¿Anular esta venta? Primero verificaremos con el banco que el QR no se haya pagado.")) return;
          setBusy(true); setError("");
          try {
            const result = await cancelPosQrSaleAction({ restaurantId, orderId: receipt.id });
            if (!result.ok) { setError("No se pudo anular: el pago puede estar confirmado o en verificación. Conserva este cobro y verifica su estado."); return; }
            setReceipt(null); onCompleted(); onClose();
          } catch { setError("No pudimos confirmar la anulación. Mantén este cobro abierto y verifica el estado."); }
          finally { setBusy(false); }
        }} type="button">{busy ? "Verificando anulación…" : "Anular venta sin pagar"}</button> : null}
        {error ? <p role="alert" className="mt-2 text-sm font-semibold text-[var(--color-danger-strong)]">{error}</p> : null}
      </> : <form action={submit} className="space-y-4">
        <input name="posRequestId" type="hidden" value={session.requestId} /><input name="restaurantId" type="hidden" value={restaurantId} /><input name="restaurantSlug" type="hidden" value={restaurantSlug} /><input name="cartJson" type="hidden" value={session.cartJson} /><input name="source" type="hidden" value={source} /><input name="orderOrigin" type="hidden" value={session.orderOrigin} /><input name="orderType" type="hidden" value={session.orderType} /><input name="paymentMethod" type="hidden" value={method} />
        <fieldset className="space-y-4" disabled={busy || uncertain}>
          <legend className="mb-2 text-sm font-black">Forma de pago</legend>
          <div className="grid grid-cols-3 gap-2">{([{ value: "cash", label: "Efectivo", icon: Wallet }, { value: "qr", label: "QR bancario", icon: QrCode }, { value: "card", label: "Tarjeta", icon: CreditCard }] as const).map(({ value, label, icon: Icon }) => <button aria-pressed={method === value} className={cn("flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border text-xs font-black disabled:opacity-40", method === value ? "border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)]" : "border-[var(--border)]")} disabled={value === "qr" && !qrAvailable} key={value} onClick={() => setMethod(value)} type="button"><Icon className="h-5 w-5" />{label}</button>)}</div>
          <Select aria-label="Otros métodos de pago" onChange={(event) => setMethod(event.target.value as PaymentMethodType)} value={method}><option value="cash">Efectivo</option><option disabled={!qrAvailable} value="qr">QR bancario {qrAvailable ? "activo" : "sin configurar"}</option><option value="card">Tarjeta</option><option value="bank_transfer">Transferencia</option><option value="other">Otro</option></Select>
          {method === "cash" ? <div className="space-y-3 rounded-2xl bg-[var(--color-surface)] p-4">
            <div className="flex items-center justify-between gap-2"><label className="text-sm font-black" htmlFor="pos-cash-received">Paga con</label><button className="min-h-11 px-2 text-xs font-bold underline" onClick={() => setCashReceived(session.total.toFixed(2))} type="button">Pago exacto</button></div>
            <Input id="pos-cash-received" name="cashReceived" type="number" inputMode="decimal" min={session.total} step="0.01" required placeholder={`Mínimo ${formatMoney(session.total)}`} value={cashReceived} onChange={(event) => setCashReceived(event.target.value)} />
            <div className="flex items-center justify-between text-sm font-black"><span>{cashValid ? "Cambio a devolver" : "Monto faltante"}</span><span>{formatMoney(cashValid ? change : Math.max(0, session.total - received))}</span></div>
          </div> : <p className="rounded-2xl bg-[var(--primary-light)] p-4 text-sm font-semibold text-[var(--primary)]">{method === "qr" ? "Generaremos un QR por el importe exacto. El pedido entra a cocina solo después de la confirmación bancaria." : "Confirma que recibiste el pago antes de registrar la venta."}</p>}
          <details><summary className="min-h-9 cursor-pointer text-sm font-bold text-[var(--muted)]">Datos del cliente (opcional)</summary><div className="mt-2 grid gap-2"><Input aria-label="Nombre del cliente" name="customerName" placeholder="Nombre del cliente" /><Input aria-label="Teléfono del cliente" name="customerPhone" type="tel" placeholder="Teléfono o WhatsApp" /></div></details>
        </fieldset>
        {error ? <p role="alert" className="rounded-xl bg-[var(--color-warning-soft)] p-3 text-sm font-semibold text-[var(--color-warning-strong)]">{error}</p> : null}
        <Button aria-busy={busy} className="sticky bottom-0 w-full shadow-lg" disabled={busy || (!uncertain && method === "cash" && !cashValid) || (method === "qr" && !qrAvailable)} type="submit">{busy ? "Procesando…" : uncertain ? "Recuperar venta" : method === "qr" ? "Generar QR y esperar pago" : hasKitchenFlow ? "Confirmar cobro y enviar a cocina" : "Confirmar cobro"}</Button>
      </form>}
    </div>
  </dialog>;
}
