"use client";

import { Bike, Check, Clock3, LoaderCircle, Radar, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatMoney } from "@/lib/utils/money";

type DispatchView = {
  status: string;
  deliveryFee: number;
  feeMinimum: number;
  feeMaximum: number;
  pickupName: string;
  dispatch: { status: string; acceptedFee: number; riderName?: string; deliveryConfirmationCode?: string | null } | null;
  pickups?: Array<{ position: number; restaurantName: string; status: string; pickedUpAt?: string | null }>;
  offer: {
    id: string;
    status: "pending" | "countered";
    offeredFee: number;
    counterFee: number | null;
    expiresAt: string;
    offerRound: number;
  } | null;
  radarRiders: Array<{ bearingDegrees: number; distanceKm: number }>;
};

function secondsLeft(expiresAt: string | undefined, now: number) {
  if (!expiresAt) return 0;
  if (!now) return 15;
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000));
}

export function MultisiteDeliverySearchRadar({ orderId, token, initialStatus }: { orderId: string; token: string; initialStatus: string }) {
  const [data, setData] = useState<DispatchView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"accept_counter" | "reject_counter" | "update_fee" | null>(null);
  const [fee, setFee] = useState("");
  const [now, setNow] = useState(0);
  const loading = useRef(false);
  const terminal = useRef(false);

  const refresh = useCallback(async () => {
    if (loading.current || terminal.current || document.hidden) return;
    loading.current = true;
    try {
      const response = await fetch(`/api/multisite-orders/${orderId}/dispatch?token=${encodeURIComponent(token)}`, { cache: "no-store" });
      const payload = await response.json() as DispatchView | { error?: string };
      if (!response.ok) throw new Error("error" in payload ? payload.error : "dispatch-refresh-failed");
      setData(payload as DispatchView);
      terminal.current = ["delivered", "cancelled"].includes((payload as DispatchView).status);
      setError(null);
    } catch {
      setError("No pudimos actualizar la búsqueda de delivery. Reintentaremos automáticamente.");
    } finally { loading.current = false; }
  }, [orderId, token]);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), 3_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [refresh]);
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => { if (data) setFee(String(data.deliveryFee)); }, [data?.deliveryFee]);

  const countdown = secondsLeft(data?.offer?.expiresAt, now);
  const searching = (data?.status ?? initialStatus) === "rider_searching" || (data?.status ?? initialStatus) === "rider_countered" || Boolean(data?.offer);
  const mapDots = useMemo(() => (data?.radarRiders ?? []).map((rider, index) => {
    const angle = (rider.bearingDegrees * Math.PI) / 180;
    const radius = Math.min(38, 11 + rider.distanceKm * 7.2);
    return {
      id: `${rider.bearingDegrees}-${rider.distanceKm}-${index}`,
      left: 50 + Math.sin(angle) * radius,
      top: 50 - Math.cos(angle) * radius,
    };
  }), [data?.radarRiders]);

  async function decideCounter(action: "accept_counter" | "reject_counter") {
    if (!data?.offer || data.offer.status !== "countered") return;
    setBusy(action);
    try {
      const response = await fetch(`/api/multisite-orders/${orderId}/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, offerId: data.offer.id, token }),
      });
      if (!response.ok) throw new Error("counter-decision-failed");
      await refresh();
    } catch {
      await refresh();
      setError("La oferta ya no está disponible. Buscaremos otra moto.");
    } finally {
      setBusy(null);
    }
  }

  async function updateFee() {
    if (!data || data.dispatch || busy) return;
    const price = Number(fee.replace(",", "."));
    if (!fee.trim() || !Number.isFinite(price) || price < data.feeMinimum || price > data.feeMaximum) {
      setError("La tarifa debe estar dentro del rango permitido."); return;
    }
    setBusy("update_fee");
    try {
      const response = await fetch(`/api/multisite-orders/${orderId}/dispatch`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_fee", fee: Math.round(price * 100) / 100, token }),
      });
      if (!response.ok) throw new Error(response.status === 503 ? "unavailable" : "locked");
      await refresh();
    } catch (error) {
      setError(error instanceof Error && error.message === "unavailable" ? "La edición de tarifa aún no está habilitada en el servidor." : "La tarifa cambió o ya hay una moto asignada. Actualiza antes de intentar nuevamente.");
    } finally { setBusy(null); }
  }

  const feePanel = data && !data.dispatch && !["delivered", "cancelled", "partially_cancelled", "rider_assigned", "in_delivery"].includes(data.status) ? (
    <div className="mt-4 rounded-2xl border border-[var(--border)] bg-white p-4">
      <label className="text-sm font-black text-[var(--primary)]" htmlFor="multisite-delivery-price">Tu oferta de entrega (Bs)</label>
      <div className="mt-2 flex flex-wrap gap-2">
        <input className="min-h-11 w-28 rounded-xl border border-[var(--border)] px-3 text-base font-bold" id="multisite-delivery-price" inputMode="decimal" onChange={(event) => setFee(event.target.value)} value={fee} />
        <button className="min-h-11 rounded-xl bg-[var(--accent)] px-4 text-sm font-black text-[var(--primary)] disabled:opacity-50" disabled={busy !== null || Number(fee.replace(",", ".")) === data.deliveryFee} onClick={() => void updateFee()} type="button">{busy === "update_fee" ? "Actualizando…" : "Actualizar oferta"}</button>
      </div>
      <p className="mt-2 text-xs font-semibold text-[var(--color-secondary-text)]">Entre {formatMoney(data.feeMinimum)} y {formatMoney(data.feeMaximum)}. Cambiar la tarifa cancela la oferta anterior. Se bloquea cuando una moto acepta.</p>
    </div>
  ) : null;

  if (["submitted", "accepted", "preparing"].includes(data?.status ?? initialStatus)) {
    return (
      <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-4 text-sm font-bold text-[var(--color-secondary-text)]">
        <span className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4 text-[var(--primary)]" />La búsqueda de delivery comenzará cuando todos los locales indiquen que el pedido está listo.</span>
        {feePanel}
        {error ? <p className="mt-2 text-xs text-amber-800">{error}</p> : null}
      </div>
    );
  }

  if (["delivered", "cancelled"].includes(data?.status ?? initialStatus)) return null;
  if (data?.dispatch || ["rider_assigned", "in_delivery"].includes(data?.status ?? initialStatus)) {
    return (
      <div className="mt-6 rounded-2xl bg-emerald-50 p-4 text-emerald-800">
        <p className="flex items-center gap-2 text-sm font-black"><Bike className="h-5 w-5" />Delivery confirmado</p>
        <p className="mt-1 text-sm font-semibold">Una moto aceptó la ruta completa. Tarifa acordada: {formatMoney(data?.dispatch?.acceptedFee ?? data?.deliveryFee ?? 0)}.</p>
        {data?.dispatch?.riderName ? <p className="mt-2 text-sm font-bold">{data.dispatch.riderName} · {data.status === "in_delivery" ? "En camino a tu dirección" : "Recogiendo en los locales"}</p> : null}
        {data?.pickups?.length ? <ol className="mt-3 space-y-2 text-sm">{data.pickups.map((pickup) => <li className="flex items-center justify-between gap-3 rounded-xl bg-white/70 p-3" key={pickup.position}><span className="font-bold">{pickup.position}. {pickup.restaurantName}</span><span>{pickup.pickedUpAt ? "Recogido" : "Pendiente de recojo"}</span></li>)}</ol> : null}
        {data?.status === "in_delivery" && data.dispatch?.deliveryConfirmationCode ? <div className="mt-4 rounded-xl bg-white p-4"><p className="text-sm font-bold">Código para recibir todos tus pedidos</p><p className="mt-2 font-mono text-3xl font-black tracking-[0.3em]">{data.dispatch.deliveryConfirmationCode}</p><p className="mt-2 text-xs">Compártelo con el rider únicamente cuando recibas el pedido completo.</p></div> : null}
      </div>
    );
  }

  if (!searching) return null;

  return (
    <section className="mt-6 overflow-hidden rounded-[1.6rem] border border-[var(--primary)]/20 bg-[linear-gradient(145deg,#f8fbff,#edf5ff)] p-4 text-[var(--color-heading)] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-black text-[var(--primary)]"><Radar className="h-4 w-4" />Buscando delivery cercano</p>
          <h2 className="mt-1 text-lg font-black">Coordinando recojo desde {data?.pickupName ?? "el primer local"}</h2>
          <p className="mt-1 text-xs font-semibold text-[var(--color-secondary-text)]">Las motos se muestran por zona aproximada; su ubicación exacta permanece privada.</p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[var(--primary)]">{data?.radarRiders.length ?? 0} cerca</span>
      </div>

      <div className="relative mx-auto mt-5 grid aspect-square w-full max-w-[260px] place-items-center overflow-hidden rounded-full border border-[var(--primary)]/20 bg-white/70 shadow-inner">
        <span className="absolute inset-[14%] rounded-full border border-dashed border-[var(--primary)]/20" />
        <span className="absolute inset-[30%] rounded-full border border-[var(--primary)]/25" />
        <span className="absolute inset-[44%] rounded-full bg-[var(--primary)]/10" />
        <span className="absolute inset-0 rounded-full border-[18px] border-[var(--primary)]/[0.035]" />
        <span className="absolute h-12 w-12 animate-ping rounded-full bg-[var(--primary)]/15" />
        <span className="relative z-10 grid h-11 w-11 place-items-center rounded-full bg-[var(--primary)] text-white shadow-lg"><Radar className="h-5 w-5" /></span>
        {mapDots.map((dot) => <span className="absolute grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-emerald-500 text-white shadow-md" key={dot.id} style={{ left: `${dot.left}%`, top: `${dot.top}%` }}><Bike className="h-4 w-4" /></span>)}
      </div>

      {data?.offer?.status === "countered" && data.offer.counterFee != null ? (
        <div className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
          <p className="text-sm font-black">Una moto propone {formatMoney(data.offer.counterFee)}</p>
          <p className="mt-1 text-xs font-semibold">Tu oferta era {formatMoney(data.offer.offeredFee)}. Decide antes de que termine el tiempo.</p>
          <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-black"><Clock3 className="h-3.5 w-3.5" />{countdown}s</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl bg-emerald-600 px-3 text-sm font-black text-white disabled:opacity-50" disabled={busy !== null || countdown === 0} onClick={() => void decideCounter("accept_counter")} type="button"><Check className="h-4 w-4" />Aceptar</button>
            <button className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-amber-300 bg-white px-3 text-sm font-black text-amber-900 disabled:opacity-50" disabled={busy !== null || countdown === 0} onClick={() => void decideCounter("reject_counter")} type="button"><X className="h-4 w-4" />Buscar otra</button>
          </div>
        </div>
      ) : (
        <div className="mt-5 flex items-center gap-3 rounded-2xl bg-white/85 p-3">
          <LoaderCircle className="h-5 w-5 animate-spin text-[var(--primary)]" />
          <div><p className="text-sm font-black">Ofreciendo {formatMoney(data?.deliveryFee ?? 0)} a una moto</p><p className="text-xs font-semibold text-[var(--color-secondary-text)]">{data?.offer ? `Esta moto tiene ${countdown}s para responder.` : "Seguiremos con la siguiente moto disponible."}</p></div>
        </div>
      )}
      {error ? <p className="mt-3 text-xs font-bold text-[var(--color-warning-strong)]">{error}</p> : null}
      {feePanel}
    </section>
  );
}
