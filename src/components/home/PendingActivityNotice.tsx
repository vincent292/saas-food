"use client";

import Link from "next/link";
import { ArrowRight, CreditCard, ReceiptText, ShoppingBag, Store, X } from "lucide-react";
import { useEffect, useState } from "react";
import { hideOrderRecovery, markOrderRecovered, orderRecoveryChanged, recoverOrder, visibleRecoverableOrders, type RecoverableOrder, type RecoveredOrder } from "@/lib/client/order-recovery";
import { pendingActivityMaxAgeMs, readableRestaurantName } from "@/lib/client/pending-activity-policy";
import { clearCart, cartUpdatedEventName, listPendingCarts, type PendingCartSummary } from "@/lib/utils/cart";
import { formatMoney } from "@/lib/utils/money";
import { publicRestaurantPath } from "@/lib/utils/public-routes";

type Entry = { row: RecoverableOrder; recovered?: RecoveredOrder | null };
function isPayment({ row, recovered }: Entry) {
  return recovered ? recovered.stage === "payment" || recovered.path.includes("/pago/") : !row.submitted;
}

export function PendingActivityNotice({ restaurantId, includeCarts = false }: { restaurantId?: string; includeCarts?: boolean }) {
  const [rows, setRows] = useState<RecoverableOrder[]>([]);
  const [carts, setCarts] = useState<PendingCartSummary[]>([]);
  const [details, setDetails] = useState<Record<string, RecoveredOrder | null>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    function sync(checkServer = true) {
      if (!alive) return;
      const next = visibleRecoverableOrders(restaurantId).sort((a, b) => b.createdAt - a.createdAt);
      const nextCarts = includeCarts ? listPendingCarts() : [];
      setRows(next); setCarts(nextCarts);
      clearTimeout(timer);
      // Expire at the boundary even if the page stays open.
      const deadlines = [...next.map(row => row.createdAt + pendingActivityMaxAgeMs), ...nextCarts.map(cart => Date.parse(cart.expiresAt))];
      if (deadlines.length) timer = setTimeout(() => sync(false), Math.max(1, Math.min(30_000, ...deadlines.map(deadline => deadline - Date.now()))));
      if (checkServer) for (const row of next) {
        void recoverOrder(row).then(result => {
          if (!alive) return;
          if (result?.terminal) { markOrderRecovered(row.requestId, true); return; }
          setDetails(current => ({ ...current, [row.requestId]: result }));
        }).catch(() => { /* A shortcut is never proof of payment. Re-check on open. */ });
      }
    }
    const refresh = () => sync(true);
    const foreground = () => { if (document.visibilityState === "visible") sync(true); };
    const initial = setTimeout(refresh, 0);
    window.addEventListener("storage", refresh);
    window.addEventListener(orderRecoveryChanged, refresh);
    window.addEventListener(cartUpdatedEventName, refresh);
    window.addEventListener("focus", foreground);
    window.addEventListener("online", foreground);
    document.addEventListener("visibilitychange", foreground);
    return () => {
      alive = false; clearTimeout(initial); clearTimeout(timer);
      window.removeEventListener("storage", refresh);
      window.removeEventListener(orderRecoveryChanged, refresh);
      window.removeEventListener(cartUpdatedEventName, refresh);
      window.removeEventListener("focus", foreground);
      window.removeEventListener("online", foreground);
      document.removeEventListener("visibilitychange", foreground);
    };
  }, [includeCarts, restaurantId]);

  async function open(row: RecoverableOrder) {
    if (busyId) return;
    setBusyId(row.requestId); setError("");
    try {
      const result = await recoverOrder(row);
      // If a submission never reached the server, resume its basket using the
      // same capability. Never mint a second intent here.
      window.location.assign(result?.path ?? publicRestaurantPath(row.restaurantSlug, "pedido"));
    } catch { setError("No pudimos conectar. Conservamos tu solicitud; no vuelvas a pagar ni crees otro pedido todavía."); }
    finally { setBusyId(null); }
  }

  const entries: Entry[] = rows.map(row => ({ row, recovered: details[row.requestId] }));
  const visibleCarts = carts.filter(cart => !entries.some(entry => entry.row.restaurantSlug === cart.restaurantSlug && entry.recovered !== null && isPayment(entry)));
  const visibleEntries = entries.filter(entry => entry.recovered !== null || !visibleCarts.some(cart => cart.restaurantSlug === entry.row.restaurantSlug));
  const total = visibleEntries.length + visibleCarts.length;
  if (!total) return null;
  const payments = visibleEntries.filter(isPayment);
  const orderedEntries = [...payments, ...visibleEntries.filter(entry => !isPayment(entry))];
  const limit = expanded ? total : 3;
  const shell = "group flex min-h-[88px] min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-[var(--color-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] disabled:opacity-60";
  const close = "grid h-11 w-11 shrink-0 place-items-center rounded-full text-[var(--muted)] transition hover:bg-[var(--color-surface)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]";

  return <section aria-label="Continúa donde lo dejaste" className="scroll-mb-28 overflow-hidden rounded-[1.4rem] border border-[var(--border)] bg-[var(--surface)] shadow-[0_8px_28px_rgb(18_53_91_/_0.045)]">
    <header className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-4 sm:px-5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--accent)] text-[var(--primary)]"><ShoppingBag className="h-[18px] w-[18px]" /></span>
      <div className="min-w-0"><h2 className="text-[15px] font-bold leading-5 text-[var(--primary)]">Continúa donde lo dejaste</h2><p className="mt-0.5 text-xs leading-4 text-[var(--muted)]">Accesos guardados durante 30 min</p></div>
    </header>
    <div className="divide-y divide-[var(--border)] px-1.5 sm:px-2">
      {orderedEntries.slice(0, limit).map(entry => {
        const { row, recovered } = entry;
        const payment = isPayment(entry);
        const received = payment && recovered?.paymentStatus === "paid";
        const name = recovered?.restaurantName || carts.find(cart => cart.restaurantSlug === row.restaurantSlug)?.restaurantName || readableRestaurantName(row.restaurantSlug);
        const Icon = payment ? CreditCard : ReceiptText;
        return <div className="flex min-w-0 items-center gap-0.5" key={row.requestId}>
          <button type="button" className={shell} disabled={busyId !== null} onClick={() => void open(row)}>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--primary-light)] text-[var(--primary)]"><Icon className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-[var(--text)]">{name}</span><span className="mt-0.5 block text-xs leading-4 text-[var(--muted)]">{received ? "Pago recibido · Confirmando pedido" : payment ? recovered ? "Pago QR por completar" : "Solicitud guardada" : "Pedido en curso"}{recovered?.amount != null ? ` · ${formatMoney(recovered.amount)}` : ""}</span><span className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-bold text-[var(--primary)]">{busyId === row.requestId ? "Abriendo…" : received ? "Ver confirmación" : payment ? "Continuar con el pago" : "Ver seguimiento"}<ArrowRight className="h-3.5 w-3.5" /></span></span>
          </button>
          <button type="button" aria-label={`Ocultar acceso de ${name}`} title="Solo oculta el acceso. No cancela ni modifica tu pago." className={close} disabled={busyId !== null} onClick={() => hideOrderRecovery(row.requestId)}><X className="h-4 w-4" /></button>
        </div>;
      })}
      {visibleCarts.slice(0, Math.max(0, limit - orderedEntries.length)).map(cart => <div className="flex min-w-0 items-center gap-0.5" key={cart.restaurantSlug}>
        <Link className={shell} href={publicRestaurantPath(cart.restaurantSlug, "pedido")}>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--color-surface)] text-[var(--primary)]"><Store className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-[var(--text)]">{cart.restaurantName === cart.restaurantSlug ? readableRestaurantName(cart.restaurantSlug) : cart.restaurantName}</span><span className="mt-0.5 block text-xs leading-4 text-[var(--muted)]">{cart.itemCount} producto{cart.itemCount === 1 ? "" : "s"} · {formatMoney(cart.total)}</span><span className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-bold text-[var(--primary)]">Revisar carrito <ArrowRight className="h-3.5 w-3.5" /></span></span>
        </Link>
        <button type="button" aria-label={`Quitar carrito de ${cart.restaurantName}`} className={close} onClick={() => clearCart(cart.restaurantSlug)}><X className="h-4 w-4" /></button>
      </div>)}
    </div>
    {total > 3 ? <button type="button" className="min-h-11 w-full border-t border-[var(--border)] text-xs font-bold text-[var(--primary)]" onClick={() => setExpanded(value => !value)}>{expanded ? "Ver menos" : `Ver todos (${total})`}</button> : null}
    {visibleCarts.length > 1 ? <Link className="flex min-h-11 items-center justify-center gap-2 border-t border-[var(--border)] px-4 text-xs font-bold text-[var(--primary)]" href="/pedido/multi">Combinar carritos en un envío <ArrowRight className="h-3.5 w-3.5" /></Link> : null}
    {payments.some(entry => entry.recovered?.paymentStatus !== "paid") ? <p className="border-t border-[var(--border)] bg-[var(--color-surface)] px-4 py-3 text-[11px] leading-4 text-[var(--muted)]">Primero el pago QR. Después, el seguimiento de tu pedido.</p> : null}
    {error ? <p className="px-4 pb-4 pt-3 text-xs leading-5 text-[var(--danger)]" role="alert">{error}</p> : null}
  </section>;
}
