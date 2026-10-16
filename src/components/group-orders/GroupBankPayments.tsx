"use client";
import { useCallback, useEffect, useState } from "react";
import { useRealtimeBroadcast } from "@/lib/client/use-realtime-broadcast";
import { formatMoney } from "@/lib/utils/money";
import type { GroupBillView } from "@/lib/services/bank-group-payment.service";
type View = { actorId: string; status: string; rows: GroupBillView[]; eligibleItemIds: string[] };
const messages: Record<string, string> = {
  "bank-connection-unavailable": "Este local todavía no tiene su cuenta bancaria habilitada. Puedes asumir efectivo si el local lo permite.",
  "group-cancel-qr-first": "Primero anula el QR y espera la confirmación del banco antes de elegir efectivo o editar.",
  "group-basket-frozen": "Esta parte ya tiene un pago o una solicitud. No podemos cambiar sus productos.",
  "bank-operation-busy": "Hay una operación en curso. Espera unos segundos; no vuelvas a pagar.",
  "group-bank-forbidden": "No tienes permiso para cambiar esta parte.",
  "group-closed": "El grupo ya está cerrado para esta operación.",
};
export function GroupBankPayments({ sessionToken, secret, host, onEligibleItems }: { sessionToken: string; secret: string; host: boolean; onEligibleItems: (ids: string[]) => void }) {
  const [view, setView] = useState<View | null>(null), [selected, setSelected] = useState<string>(), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [others, setOthers] = useState(false);
  const endpoint = `/api/payments/baneco/group?sessionToken=${encodeURIComponent(sessionToken)}`;
  const refresh = useCallback(async () => {
    try {
      const response = await fetch(endpoint + (selected ? `&billId=${encodeURIComponent(selected)}` : ""), { cache: "no-store", headers: { "x-group-access": secret, "x-group-role": host ? "host" : "participant" } });
      if (!response.ok) return;
      const result = await response.json() as View; setView(result); onEligibleItems(result.eligibleItemIds);
    } catch { /* A return from the bank resyncs; no payment is inferred locally. */ }
  }, [endpoint, selected, secret, host, onEligibleItems]);
  useEffect(() => { const timer = window.setTimeout(() => { void refresh(); }, 0); return () => window.clearTimeout(timer); }, [refresh]);
  useRealtimeBroadcast({ topic: `bank-group:${sessionToken}`, onChange: refresh, onSync: refresh });
  async function operate(row: GroupBillView, action: "qr" | "cash" | "reset" | "cancel") {
    const other = row.participantId !== view?.actorId;
    if (action === "cash" && !window.confirm(other ? `¿Asumir en efectivo ${formatMoney(row.amount)} por ${row.participantName} en ${row.restaurantName}? No se marcará pagado.` : `¿Confirmar ${formatMoney(row.amount)} en efectivo? Esta parte entrará al pedido, pero seguirá pendiente de cobro.`)) return;
    if (action === "qr" && other && !window.confirm(`¿Pagar ${formatMoney(row.amount)} por ${row.participantName} directamente a ${row.restaurantName}?`)) return;
    if (action === "cancel" && !window.confirm("¿Anular este QR pendiente? Primero comprobaremos con el banco si ya fue pagado.")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", "x-group-access": secret, "x-group-role": host ? "host" : "participant" },
        body: JSON.stringify(action === "cancel" ? { action, billId: row.id } : { action, participantId: row.participantId, restaurantId: row.restaurantId, payingOther: other }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setView(data); onEligibleItems(data.eligibleItemIds); setSelected(data.rows.find((bill: GroupBillView) => bill.participantId === row.participantId && bill.restaurantId === row.restaurantId)?.id);
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      setError(messages[code] ?? "No pudimos completar la operación. Recuperaremos la misma solicitud; no pagues otra vez sin revisar su estado.");
      await refresh();
    } finally { setBusy(false); }
  }
  const editable = view?.status === "open" || view?.status === "locked";
  return <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4" aria-live="polite">
    <h2 className="text-lg font-black">Tu pago, directo a cada local</h2>
    <p className="text-sm text-[var(--muted)]">Cada parte tiene su propio QR. Solo entra lo pagado o asumido en efectivo. El delivery se acuerda y paga por separado al cerrar.</p>
    <p className="text-xs text-[var(--muted)]">Puedes descargar el QR y abrir tu banco en este celular. Al volver verás el mismo pago. Una parte confirmada queda congelada; no necesitas subir comprobante.</p>
    <button className="min-h-11 text-sm font-bold underline" type="button" onClick={() => setOthers(!others)}>{others ? "Ver solo mi parte" : "Ver y pagar por otra persona"}</button>
    {!view ? <p className="text-sm">Recuperando pagos…</p> : view.rows.filter(row => others || row.participantId === view.actorId).map(row => <article className="space-y-2 rounded-xl border border-[var(--border)] p-3" key={row.participantId + row.restaurantId}>
      <div className="flex flex-wrap justify-between gap-2"><div><h3 className="font-bold">{row.restaurantName}</h3><p className="text-xs text-[var(--muted)]">{row.participantName}</p></div><strong>{formatMoney(row.amount)}</strong></div>
      <p className={`text-sm font-bold ${row.status === "paid" ? "text-emerald-700" : "text-[var(--primary)]"}`}>{row.status === "paid" ? "Pagado · verificado por el banco" : row.status === "cash" ? "Efectivo asumido · pendiente de cobro" : row.status === "not_created" ? "Sin confirmar · no se enviará" : row.status === "pending" ? "Esperando pago" : "Verificación en curso · no vuelvas a pagar"}</p>
      {row.image && row.status === "pending" ? <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={`QR de ${row.restaurantName} para ${row.participantName}`} src={row.image} className="mx-auto aspect-square w-full max-w-64 rounded-xl object-contain" />
        <a className="flex min-h-11 items-center justify-center text-sm font-bold underline" href={row.image} download={`yopido-grupal-${row.id}.png`}>Descargar QR de este local</a>
      </> : null}
      {editable && row.status !== "paid" ? <div className="flex flex-wrap gap-2">
        {row.status === "not_created" ? <><button type="button" disabled={busy} onClick={() => void operate(row, "qr")} className="min-h-11 rounded-xl bg-[var(--accent)] px-3 text-sm font-bold text-[var(--primary)]">{busy ? "Procesando…" : "Pagar con QR"}</button><button className="min-h-11 px-3 text-sm font-bold underline" type="button" disabled={busy} onClick={() => void operate(row, "cash")}>Asumir efectivo</button></> : null}
        {row.status === "pending" && !row.image ? <button className="min-h-11 px-3 text-sm font-bold underline" type="button" disabled={busy} onClick={() => setSelected(row.id)}>Ver mi QR</button> : null}
        {["pending", "expired", "unknown", "review"].includes(row.status) && row.canReset ? <button className="min-h-11 px-3 text-xs underline" type="button" disabled={busy} onClick={() => void operate(row, "cancel")}>Anular QR</button> : null}
        {["cash", "not_created"].includes(row.status) && row.id && row.canReset ? <button className="min-h-11 px-3 text-xs underline" type="button" disabled={busy} onClick={() => void operate(row, "reset")}>Liberar para editar</button> : null}
      </div> : null}
    </article>)}
    {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
  </section>;
}
