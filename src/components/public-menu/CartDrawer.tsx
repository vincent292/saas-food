"use client";

import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { buttonClasses } from "@/components/ui/Button";
import { formatMoney } from "@/lib/utils/money";
import { readCart, type CartProduct } from "@/lib/utils/cart";

export function CartDrawer({ restaurantSlug }: { restaurantSlug: string }) {
  const [items, setItems] = useState<CartProduct[]>([]);

  useEffect(() => {
    const refresh = () => setItems(readCart());
    refresh();
    window.addEventListener("restaurant-saas-cart-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("restaurant-saas-cart-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const total = useMemo(() => items.reduce((sum, item) => sum + item.price * item.quantity, 0), [items]);

  return (
    <Drawer>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--muted)]">Tu carrito</p>
          <h3 className="text-xl font-black text-[var(--text)]">{items.length} productos</h3>
        </div>
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--primary-light)] text-[var(--primary)]">
          <ShoppingBag className="h-5 w-5" />
        </span>
      </div>
      <div className="mt-4 space-y-3">
        {items.length ? (
          items.map((item) => (
            <div className="rounded-2xl border border-[var(--border)] p-3" key={item.productId}>
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-[var(--text)]">{item.name}</p>
                <p className="text-sm font-bold">{formatMoney(item.price * item.quantity)}</p>
              </div>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {item.quantity} x {formatMoney(item.price)}
              </p>
            </div>
          ))
        ) : (
          <p className="rounded-2xl bg-[var(--primary-light)] p-4 text-sm font-semibold text-[var(--primary-dark)]">Agrega productos para iniciar un pedido.</p>
        )}
      </div>
      <div className="mt-5 flex items-center justify-between text-lg font-black">
        <span>Total</span>
        <span>{formatMoney(total)}</span>
      </div>
      <Link className={buttonClasses("primary", "mt-5 w-full")} href={`/r/${restaurantSlug}/checkout`}>
        Ir al checkout
      </Link>
    </Drawer>
  );
}
