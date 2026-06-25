"use client";

import { Bike, Store, Table2 } from "lucide-react";
import { useMemo, useState } from "react";
import { createPublicOrderAction } from "@/app/r/actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { readCart, type CartProduct } from "@/lib/utils/cart";
import { formatMoney } from "@/lib/utils/money";

export function CheckoutClient({
  restaurantId,
  restaurantSlug,
  error,
}: {
  restaurantId: string;
  restaurantSlug: string;
  error?: string;
}) {
  const [cart] = useState<CartProduct[]>(() => readCart());
  const cartJson = useMemo(() => JSON.stringify(cart), [cart]);
  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart]);

  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-4 pb-28 pt-8 sm:px-6 lg:grid-cols-[1fr_360px] lg:px-8">
      <section className="space-y-6">
        <SectionTitle title="Checkout" description="Datos del cliente, entrega, pago y resumen del pedido." />
        {error ? (
          <div className="rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700">
            No se pudo confirmar el pedido. Revisa que el carrito tenga productos y que la conexión con Supabase esté activa.
          </div>
        ) : null}
        <form action={createPublicOrderAction} className="space-y-6">
          <input name="restaurantId" type="hidden" value={restaurantId} />
          <input name="restaurantSlug" type="hidden" value={restaurantSlug} />
          <input name="cartJson" type="hidden" value={cartJson} />
          <Card className="grid gap-4 md:grid-cols-2">
            <Input name="customerName" placeholder="Nombre del cliente" required />
            <Input name="customerPhone" placeholder="Teléfono" />
            <Select defaultValue="pickup" name="orderType">
              <option value="table">Pedido en mesa</option>
              <option value="delivery">Delivery</option>
              <option value="pickup">Recojo en local</option>
            </Select>
            <Select defaultValue="qr" name="paymentMethod">
              <option value="cash">Efectivo</option>
              <option value="qr">QR</option>
              <option value="bank_transfer">Transferencia</option>
              <option value="card">Tarjeta futuro</option>
            </Select>
            <Input className="md:col-span-2" name="customerAddress" placeholder="Dirección si es delivery" />
            <Textarea className="md:col-span-2" name="notes" placeholder="Notas del pedido" />
          </Card>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              { label: "Mesa", icon: Table2 },
              { label: "Delivery", icon: Bike },
              { label: "Recojo", icon: Store },
            ].map((item) => (
              <Card className="flex items-center gap-3" key={item.label}>
                <item.icon className="h-5 w-5 text-[var(--primary)]" />
                <span className="font-bold">{item.label}</span>
              </Card>
            ))}
          </div>
          <Button className="w-full md:w-auto" disabled={!cart.length}>
            Confirmar pedido
          </Button>
        </form>
      </section>
      <aside className="space-y-4">
        <Card>
          <h3 className="text-lg font-black">Productos</h3>
          <div className="mt-3 space-y-3">
            {cart.length ? (
              cart.map((item) => (
                <div className="rounded-2xl bg-[var(--primary-light)] p-3" key={item.productId}>
                  <div className="flex justify-between gap-3">
                    <p className="font-semibold">{item.name}</p>
                    <p className="font-bold">{formatMoney(item.price * item.quantity)}</p>
                  </div>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {item.quantity} x {formatMoney(item.price)}
                  </p>
                </div>
              ))
            ) : (
              <p className="rounded-2xl bg-[var(--primary-light)] p-4 text-sm font-semibold text-[var(--primary-dark)]">Tu carrito está vacío.</p>
            )}
          </div>
        </Card>
        <Card>
          <h3 className="text-lg font-black">Resumen</h3>
          <div className="mt-4 flex justify-between text-sm text-[var(--muted)]">
            <span>Subtotal</span>
            <span>{formatMoney(subtotal)}</span>
          </div>
          <div className="mt-4 flex justify-between border-t border-[var(--border)] pt-4 text-xl font-black">
            <span>Total</span>
            <span>{formatMoney(subtotal)}</span>
          </div>
        </Card>
      </aside>
    </main>
  );
}
