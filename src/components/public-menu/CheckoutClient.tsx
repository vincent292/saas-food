"use client";

import { Bike, Store, Table2 } from "lucide-react";
import { useMemo, useState } from "react";
import { createPublicOrderAction } from "@/app/r/actions";
import { CompressedImageInput } from "@/components/settings/CompressedImageInput";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { IllustrationAsset } from "@/components/ui/IllustrationAsset";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { readCart, type CartProduct } from "@/lib/utils/cart";
import { formatMoney } from "@/lib/utils/money";
import type { RestaurantSettings } from "@/types/restaurant.types";

type OrderType = "table" | "delivery" | "pickup";

export function CheckoutClient({
  restaurantId,
  restaurantSlug,
  error,
  settings,
}: {
  restaurantId: string;
  restaurantSlug: string;
  error?: string;
  settings: RestaurantSettings | null;
}) {
  const [cart] = useState<CartProduct[]>(() => readCart(restaurantSlug));
  const [selectedOrderType, setSelectedOrderType] = useState<OrderType>(() => {
    if (settings?.pickupEnabled ?? true) {
      return "pickup";
    }

    if (settings?.tableOrdersEnabled ?? true) {
      return "table";
    }

    return "delivery";
  });
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("qr");
  const cartJson = useMemo(() => JSON.stringify(cart), [cart]);
  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart]);
  const orderTypes = useMemo(
    () =>
      [
        { value: "table" as const, label: "Pedido en mesa", enabled: settings?.tableOrdersEnabled ?? true },
        { value: "delivery" as const, label: "Delivery", enabled: settings?.deliveryEnabled ?? true },
        { value: "pickup" as const, label: "Recojo en local", enabled: settings?.pickupEnabled ?? true },
      ].filter((option) => option.enabled),
    [settings?.deliveryEnabled, settings?.pickupEnabled, settings?.tableOrdersEnabled],
  );
  const freeDeliveryFrom = settings?.freeDeliveryFrom ?? 0;
  const deliveryFee = selectedOrderType === "delivery" && (!freeDeliveryFrom || subtotal < freeDeliveryFrom) ? (settings?.deliveryFee ?? 0) : 0;
  const total = subtotal + deliveryFee;
  const minOrderAmount = settings?.minOrderAmount ?? 0;
  const belowMinimum = subtotal > 0 && subtotal < minOrderAmount;
  const errorMessage =
    error === "minimum"
      ? "El pedido no llega al mínimo configurado por el restaurante."
      : error === "no-open-cash"
        ? "La caja esta cerrada. El restaurante debe abrir caja para recibir pedidos."
        : error === "receipt-required"
        ? "Para pago QR debes subir el comprobante antes de confirmar."
        : error === "temporarily-closed"
          ? "El restaurante esta cerrado temporalmente y no esta recibiendo pedidos."
        : error === "disabled"
          ? "La modalidad seleccionada ya no esta habilitada para este restaurante."
          : error === "settings"
            ? "Falta configurar las reglas operativas del restaurante."
            : error === "invalid"
              ? "Faltan datos obligatorios o el carrito no tiene el formato correcto."
              : error === "product-not-found"
                ? "Uno de los productos ya no esta disponible. Actualiza el menu e intenta nuevamente."
                : error === "product-configuration"
                  ? "Uno de los productos necesita opciones validas. Vuelve a agregarlo al pedido."
                  : error === "service-role-required"
                    ? "Falta una configuracion segura del servidor para recibir pedidos."
                    : error === "create"
                      ? "Supabase rechazo la creacion del pedido. Revisa permisos o intenta nuevamente."
                      : error === "create-items"
                        ? "El pedido se inicio, pero no se pudieron guardar sus productos. Intenta nuevamente."
                        : "No se pudo confirmar el pedido. Revisa que el carrito tenga productos y que la conexion con Supabase este activa.";

  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-4 pb-28 pt-8 sm:px-6 lg:grid-cols-[1fr_360px] lg:px-8">
      <section className="space-y-6">
        <SectionTitle title="Confirmar pedido" description="Datos de contacto, modalidad, pago y resumen final." />
        <Card className="overflow-hidden bg-[linear-gradient(135deg,var(--surface)_0%,var(--primary-light)_100%)] p-4 sm:p-5">
          <div className="flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--primary)]">Ultimo paso</p>
              <h2 className="mt-1 text-xl font-black text-[var(--text)]">Datos para preparar y avisarte</h2>
              <p className="mt-1 text-sm font-semibold text-[var(--muted)]">El restaurante usara esta informacion solo para coordinar este pedido.</p>
            </div>
            <IllustrationAsset className="hidden max-w-[150px] sm:block" name="orderSuccess" priority sizes="150px" />
          </div>
        </Card>
        {error ? <div className="rounded-2xl bg-[var(--color-danger-soft)] p-3 text-sm font-semibold text-[var(--color-danger-strong)]">{errorMessage}</div> : null}
        {belowMinimum ? (
          <div className="rounded-2xl bg-[var(--color-warning-soft)] p-3 text-sm font-semibold text-[var(--color-warning-strong)]">
            Pedido mínimo: {formatMoney(minOrderAmount, settings?.currency)}.
          </div>
        ) : null}
        <form action={createPublicOrderAction} className="space-y-6">
          <input name="restaurantId" type="hidden" value={restaurantId} />
          <input name="restaurantSlug" type="hidden" value={restaurantSlug} />
          <input name="cartJson" type="hidden" value={cartJson} />
          <Card className="grid gap-4 md:grid-cols-2">
            <Input name="customerName" placeholder="Nombre del cliente" required />
            <Input name="customerPhone" placeholder="Telefono" />
            <Select disabled={!orderTypes.length} name="orderType" onChange={(event) => setSelectedOrderType(event.target.value as OrderType)} value={selectedOrderType}>
              {orderTypes.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select defaultValue="qr" name="paymentMethod" onChange={(event) => setSelectedPaymentMethod(event.target.value)}>
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
          {selectedPaymentMethod === "qr" && settings?.qrPaymentUrl ? (
            <Card className="grid gap-3 sm:grid-cols-[120px_1fr]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="QR de pago" className="h-28 w-28 rounded-2xl border border-[var(--border)] object-cover" src={settings.qrPaymentUrl} />
              <div>
                <h3 className="font-black text-[var(--text)]">Pago por QR</h3>
                <p className="mt-1 text-sm text-[var(--muted)]">Escanea el QR del restaurante y confirma el pedido.</p>
              </div>
            </Card>
          ) : null}
          {selectedPaymentMethod === "qr" ? (
            <Card>
              <CompressedImageInput acceptPdf help="Sube captura o PDF del pago. Las imagenes se optimizan en WebP." label="Comprobante QR" name="paymentReceiptFile" required />
            </Card>
          ) : null}
          <Button className="w-full md:w-auto" disabled={!cart.length || belowMinimum || !orderTypes.length}>
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
                    <p className="font-bold">{formatMoney(item.price * item.quantity, settings?.currency)}</p>
                  </div>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {item.quantity} x {formatMoney(item.price, settings?.currency)}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-[1.5rem] bg-[var(--primary-light)] p-5 text-center text-sm font-semibold text-[var(--primary-dark)]">
                <IllustrationAsset className="mx-auto max-w-[180px]" name="emptyCart" sizes="180px" />
                <p className="mt-3 font-black text-[var(--primary)]">Tu carrito esta vacio</p>
                <p className="mt-1 text-xs font-semibold text-[var(--muted)]">Vuelve al menu y agrega tus platos favoritos.</p>
              </div>
            )}
          </div>
        </Card>
        <Card>
          <h3 className="text-lg font-black">Resumen</h3>
          <div className="mt-4 flex justify-between text-sm text-[var(--muted)]">
            <span>Subtotal</span>
            <span>{formatMoney(subtotal, settings?.currency)}</span>
          </div>
          <div className="mt-3 flex justify-between text-sm text-[var(--muted)]">
            <span>Delivery</span>
            <span>{formatMoney(deliveryFee, settings?.currency)}</span>
          </div>
          <div className="mt-4 flex justify-between border-t border-[var(--border)] pt-4 text-xl font-black">
            <span>Total</span>
            <span>{formatMoney(total, settings?.currency)}</span>
          </div>
        </Card>
      </aside>
    </main>
  );
}
