"use client";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
type State = { calls: { id: string; tableName: string; createdAt: string }[]; reservations: { id: string; tableName: string; orderNumber: string; total: number; paymentStatus?: string; items: { name: string; quantity: number; subtotal: number }[] }[] };
export function TableServiceInbox({ restaurantId }: { restaurantId: string }) {
  const [data, setData] = useState<State>({ calls: [], reservations: [] }), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try { const result = await fetch(`/api/mobile/pos/table-service?restaurantId=${restaurantId}`, { cache: "no-store" }); if (!result.ok) throw new Error("unavailable"); setData(await result.json()); setError(""); }
    catch { setError("No se pudo sincronizar la atención de mesas."); }
  }, [restaurantId]);
  useEffect(() => {
    const initial = setTimeout(() => void refresh(), 0); const sync = () => { if (document.visibilityState === "visible") void refresh(); };
    const db = createClient(), channel = db.channel(`table-service:${restaurantId}`, { config: { private: true } }).on("broadcast", { event: "changed" }, sync).subscribe();
    const timer = setInterval(sync, 20000); window.addEventListener("focus", sync);
    return () => { clearTimeout(initial); clearInterval(timer); window.removeEventListener("focus", sync); void db.removeChannel(channel); };
  }, [refresh, restaurantId]);
  async function attend(callId: string) {
    setBusy(true);
    try {
      const result = await fetch("/api/mobile/pos/table-service", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restaurantId, callId }) });
      if (!result.ok) throw new Error("forbidden"); setData(await result.json()); setError("");
    } catch { setError("No se pudo confirmar la atención. Revisa tu sesión."); }
    finally { setBusy(false); }
  }
  return <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4" aria-live="polite">
    <h3 className="font-black">Atención y pagos de mesas</h3>
    <p className="text-sm text-[var(--muted)]">Las solicitudes sin pagar no se preparan. El banco las enviará a pedidos cuando confirme el pago.</p>
    {data.calls.map(call => <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--primary-light)] p-3" key={call.id}><p className="font-bold">{call.tableName} solicita atención</p><button type="button" disabled={busy} onClick={() => void attend(call.id)} className="min-h-11 rounded-xl bg-[var(--accent)] px-4 font-bold">Marcar atendida</button></div>)}
    {!data.calls.length ? <p className="text-sm">Sin llamadas pendientes.</p> : null}
    {data.reservations.length ? <details><summary className="min-h-11 cursor-pointer py-3 font-bold">{data.reservations.length} solicitudes pendientes de QR · No preparar</summary><div className="space-y-2">{data.reservations.map(row => <div key={row.id} className="space-y-2 rounded-xl border border-[var(--border)] p-3 text-sm"><p>{row.tableName} · {row.orderNumber} · Bs {row.total.toFixed(2)} · {row.paymentStatus === "paid" ? "Pago recibido · Revisar aplicación · No volver a cobrar" : "Sin confirmar"}</p>{row.items.map((item, index) => <p key={index}>{item.quantity} × {item.name} · Bs {item.subtotal.toFixed(2)}</p>)}</div>)}</div></details> : null}
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
  </section>;
}
