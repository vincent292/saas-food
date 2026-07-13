"use client";

import Link from "next/link";
import { Clock3, ShoppingBag, X } from "lucide-react";
import { useEffect, useState } from "react";
import { clearCart, cartUpdatedEventName, listPendingCarts, type PendingCartSummary } from "@/lib/utils/cart";
import { formatMoney } from "@/lib/utils/money";

export function PendingCartNotice() {
  const [carts, setCarts] = useState<PendingCartSummary[]>([]);

  useEffect(() => {
    const refresh = () => setCarts(listPendingCarts());
    refresh();
    window.addEventListener(cartUpdatedEventName, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(cartUpdatedEventName, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  if (!carts.length) {
    return null;
  }

  return (
    <section className="rounded-[1.5rem] border border-[var(--accent)]/60 bg-[linear-gradient(135deg,var(--accent-soft)_0%,#ffffff_72%)] p-3 shadow-[0_18px_48px_rgb(18_53_91_/_0.08)]">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-[var(--primary)] shadow-[var(--shadow-glow)]">
          <ShoppingBag className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-[var(--primary)]">Tienes productos pendientes en tu carrito</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-[var(--color-secondary-text)]">
            Los guardamos solo por hoy y separados por restaurante.
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {carts.map((cart) => (
              <div className="grid gap-2 rounded-[1.1rem] border border-[var(--border)] bg-white p-3 shadow-sm" key={cart.restaurantSlug}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-[var(--color-heading)]">{cart.restaurantName}</p>
                    <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-secondary-text)]">
                      <Clock3 className="h-3.5 w-3.5" />
                      {cart.itemCount} producto{cart.itemCount === 1 ? "" : "s"} | {formatMoney(cart.total)}
                    </p>
                  </div>
                  <button
                    aria-label={`Quitar carrito de ${cart.restaurantName}`}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--color-surface)] text-[var(--color-secondary-text)] transition hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger-strong)]"
                    onClick={() => {
                      clearCart(cart.restaurantSlug);
                      setCarts(listPendingCarts());
                    }}
                    type="button"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <Link className="inline-flex min-h-10 items-center justify-center rounded-full bg-[var(--primary)] px-4 text-sm font-black text-white transition hover:bg-[var(--primary-dark)]" href={`/r/${cart.restaurantSlug}`}>
                  Continuar pedido
                </Link>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
