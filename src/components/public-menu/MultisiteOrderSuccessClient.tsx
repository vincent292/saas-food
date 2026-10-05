"use client";

import Link from "next/link";
import { Bike, CheckCircle2, Clock3, MapPin, PackageCheck } from "lucide-react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { clearCart } from "@/lib/utils/cart";
import { formatMoney } from "@/lib/utils/money";
import { MultisiteDeliverySearchRadar } from "@/components/public-menu/MultisiteDeliverySearchRadar";

type Child = {
  restaurantName: string;
  restaurantSlug: string;
  orderNumber: string;
  status: string;
  pickupPosition: number;
  estimatedReadyMinutes: number;
  subtotal: number;
};

const statusLabel: Record<string, string> = {
  pending: "Pendiente de confirmar",
  accepted: "Confirmado",
  preparing: "En preparación",
  ready: "Listo para recoger",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

export function MultisiteOrderSuccessClient({
  order,
}: {
  order: {
    id: string;
    trackingToken: string;
    status: string;
    total: number;
    subtotal: number;
    deliveryFee: number;
    children: Child[];
  };
}) {
  const router = useRouter();

  useEffect(() => {
    for (const child of order.children) {
      if (child.restaurantSlug) clearCart(child.restaurantSlug);
    }
  }, [order.children]);

  useEffect(() => {
    if (["delivered", "cancelled"].includes(order.status)) return;
    const interval = window.setInterval(() => router.refresh(), 20_000);
    return () => window.clearInterval(interval);
  }, [order.status, router]);

  const allReady = order.children.length > 0 && order.children.every((child) => child.status === "ready" || child.status === "delivered");
  return (
    <main className="public-brand-theme min-h-screen bg-[var(--color-background)] px-4 py-8 sm:px-6">
      <section className="mx-auto max-w-2xl rounded-[2rem] bg-white p-6 shadow-[0_24px_70px_rgb(18_53_91_/_0.12)] sm:p-8">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-7 w-7" /></span>
        <p className="mt-5 text-sm font-black text-emerald-700">Pedido recibido</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-[var(--color-heading)]">Tus locales ya recibieron el pedido</h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-[var(--color-secondary-text)]">El total se cobra una sola vez en efectivo al recibir. Esta pantalla se actualiza automáticamente mientras los locales preparan tu pedido.</p>

        <div className="mt-6 rounded-2xl bg-[var(--color-surface)] p-4">
          <div className="flex justify-between text-sm font-semibold text-[var(--color-secondary-text)]"><span>Productos</span><span>{formatMoney(order.subtotal)}</span></div>
          <div className="mt-2 flex justify-between text-sm font-semibold text-[var(--color-secondary-text)]"><span>Entrega única</span><span>{formatMoney(order.deliveryFee)}</span></div>
          <div className="mt-3 flex justify-between border-t border-[var(--border)] pt-3 text-lg font-black text-[var(--color-heading)]"><span>Total a cobrar</span><span>{formatMoney(order.total)}</span></div>
        </div>

        <div className="mt-6 space-y-3">
          {order.children.map((child) => (
            <article className="flex gap-3 rounded-2xl border border-[var(--border)] p-4" key={child.orderNumber}>
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--primary)] text-sm font-black text-white">{child.pickupPosition}</span>
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-black text-[var(--color-heading)]">{child.restaurantName}</p><p className="mt-0.5 text-xs font-bold text-[var(--color-secondary-text)]">Pedido {child.orderNumber} · {formatMoney(child.subtotal)}</p></div><span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-xs font-black text-[var(--primary)]">{statusLabel[child.status] ?? child.status}</span></div><p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-secondary-text)]"><Clock3 className="h-3.5 w-3.5" />Estimado de preparación: {child.estimatedReadyMinutes} min</p></div>
            </article>
          ))}
        </div>
        {allReady && order.status === "ready_for_dispatch" ? <p className="mt-6 flex gap-2 rounded-2xl bg-[var(--accent-soft)] p-4 text-sm font-bold leading-6 text-[var(--primary)]"><Bike className="mt-0.5 h-5 w-5 shrink-0" />Los locales reportan el pedido listo. Ya estamos buscando una moto para seguir el orden de recojo.</p> : <p className="mt-6 flex gap-2 rounded-2xl bg-[var(--accent-soft)] p-4 text-sm font-bold leading-6 text-[var(--primary)]"><PackageCheck className="mt-0.5 h-5 w-5 shrink-0" />Los locales preparan de acuerdo con el orden de la ruta. La salida se coordina cuando el conjunto esté listo.</p>}
        <MultisiteDeliverySearchRadar initialStatus={order.status} orderId={order.id} token={order.trackingToken} />
        <Link className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--primary)] px-5 text-sm font-black text-white" href="/"><MapPin className="h-4 w-4" />Seguir explorando yopido.shop</Link>
      </section>
    </main>
  );
}
