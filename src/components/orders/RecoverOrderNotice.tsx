"use client";
import { useEffect, useState } from "react";
import { forgetOrderRecovery, orderRecoveryChanged, readRecoverableOrders, recoverOrder, type RecoverableOrder } from "@/lib/client/order-recovery";
export function RecoverOrderNotice({ restaurantId }: { restaurantId?: string }) {
  const [rows, setRows] = useState<RecoverableOrder[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const sync = () => setRows(readRecoverableOrders().filter(row => !restaurantId || row.restaurantId === restaurantId));
    sync(); window.addEventListener("storage", sync); window.addEventListener(orderRecoveryChanged, sync);
    return () => { window.removeEventListener("storage", sync); window.removeEventListener(orderRecoveryChanged, sync); };
  }, [restaurantId]);
  async function open(row: RecoverableOrder) {
    setBusy(true); setError("");
    try {
      const result = await recoverOrder(row);
      if (result) { window.location.assign(result.path); return; }
      setError("Todavía no encontramos el pedido. Si el envío se interrumpió, vuelve a confirmar con la misma solicitud; no volveremos a crear uno si ya existe.");
    } catch { setError("Sin conexión para recuperar el pedido. Intenta nuevamente; no necesitas volver a pagar."); }
    finally { setBusy(false); }
  }
  if (!rows.length) return null;
  return <section className="my-3 rounded-2xl border border-[var(--accent)] bg-[var(--accent-soft)] p-4">
    <h2 className="font-black text-[var(--primary)]">Retoma tu pedido o pago</h2>
    <p className="mt-1 text-sm">¿Volviste de tu banco? Recupera el mismo pedido y su QR, sin volver a pagar.</p>
    {rows.map(row => <div className="mt-3 flex flex-wrap items-center gap-2" key={row.requestId}>
      <button className="min-h-11 rounded-xl bg-[var(--primary)] px-4 text-sm font-bold text-white" type="button" disabled={busy} onClick={() => void open(row)}>Continuar · {row.restaurantSlug}</button>
      <button className="min-h-11 px-2 text-xs underline" type="button" disabled={busy} onClick={() => {
        if (window.confirm("Esto solo quita el acceso de este dispositivo. No cancela el pedido ni anula el QR del banco. ¿Ocultarlo?")) forgetOrderRecovery(row.requestId);
      }}>Ocultar acceso</button>
    </div>)}
    {error ? <p className="mt-2 text-sm" role="alert">{error}</p> : null}
  </section>;
}
