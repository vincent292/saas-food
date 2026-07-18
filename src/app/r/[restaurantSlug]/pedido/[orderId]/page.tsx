import { notFound } from "next/navigation";
import { RestaurantLayout } from "@/components/layout/RestaurantLayout";
import { OrderTrackingLiveRefresh } from "@/components/orders/OrderTrackingLiveRefresh";
import { ClearCartOnOrderSuccess } from "@/components/public-menu/ClearCartOnOrderSuccess";
import { TablePaymentNotice } from "@/components/tables/TablePaymentNotice";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { businessPickupReadyLabel, businessTypeSupportsKitchen } from "@/lib/restaurant-directory-options";
import { orderService } from "@/lib/services/order.service";
import { restaurantService } from "@/lib/services/restaurant.service";
import { formatMoney } from "@/lib/utils/money";
import type { OrderItem } from "@/types/order.types";

const orderTypeLabel = {
  delivery: "Envio a domicilio",
  pickup: "Recojo en local",
  table: "Mesa",
  pos: "Venta POS",
};

export default async function TrackingPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantSlug: string; orderId: string }>;
  searchParams: Promise<{ token?: string; tablePending?: string }>;
}) {
  const [{ restaurantSlug, orderId }, { token, tablePending }] = await Promise.all([params, searchParams]);
  const restaurant = await restaurantService.getBySlug(restaurantSlug);

  if (!restaurant) {
    notFound();
  }

  const [order, queueState] = await Promise.all([
    token ? orderService.getPublicByTracking(restaurant.id, orderId, token) : orderService.getById(restaurant.id, orderId),
    token ? orderService.getPublicQueueState(restaurant.id, orderId, token) : Promise.resolve(null),
  ]);

  if (!order) {
    notFound();
  }

  return (
    <RestaurantLayout restaurant={restaurant} showCart={false} showMobileNav={false}>
      <ClearCartOnOrderSuccess enabled={Boolean(token)} restaurantSlug={restaurantSlug} />
      {order.orderType === "table" && tablePending ? <TablePaymentNotice orderNumber={order.orderNumber} /> : null}
      <main className="mx-auto grid max-w-6xl gap-4 px-4 pb-16 pt-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6 lg:px-8 lg:pt-8">
        <section className="min-w-0">
          <OrderTrackingLiveRefresh businessType={restaurant.businessType} initialOrder={order} initialQueue={queueState} restaurantSlug={restaurantSlug} token={token} />
        </section>

        <aside className="order-first min-w-0 lg:order-none lg:sticky lg:top-24 lg:self-start">
          <Card className="overflow-hidden p-0">
            <div className="border-b border-[var(--border)] bg-[var(--color-surface)] p-4 sm:p-5">
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--primary)]">Resumen</p>
                  <h2 className="mt-2 text-xl font-black leading-tight text-[var(--text)]">Pedido {order.orderNumber}</h2>
                </div>
                <Badge className="max-w-full border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--primary-dark)]">{orderTypeLabel[order.orderType]}</Badge>
              </div>
              <p className="mt-3 hidden text-sm font-semibold leading-6 text-[var(--muted)] sm:block">
                {order.orderType === "pickup"
                  ? `Cuando el estado sea ${businessPickupReadyLabel(restaurant.businessType).toLowerCase()}, pasa por el local con este numero.`
                  : order.orderType === "delivery"
                    ? "El estado te avisara cuando el pedido salga para entrega."
                    : order.orderType === "table"
                      ? "Para que el pedido se procese, caja debe confirmar el pago primero."
                    : businessTypeSupportsKitchen(restaurant.businessType)
                      ? "El restaurante actualizara el avance del pedido aqui."
                      : "La tienda actualizara el avance del pedido aqui."}
              </p>
            </div>

            <div className="hidden max-h-[360px] overflow-y-auto p-5 lg:block lg:max-h-[calc(100vh-360px)]">
              <OrderItemsList items={order.items} />
            </div>

            <details className="border-t border-[var(--border)] lg:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-black text-[var(--text)]">
                Ver productos
                <span className="rounded-full bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--muted)]">{order.items.length}</span>
              </summary>
              <div className="px-4 pb-4">
                <OrderItemsList items={order.items} />
              </div>
            </details>

            <div className="space-y-3 border-t border-[var(--border)] p-4 sm:p-5">
              {order.deliveryFee ? (
                <div className="flex justify-between text-sm font-semibold text-[var(--muted)]">
                  <span>Delivery</span>
                  <span>{formatMoney(order.deliveryFee)}</span>
                </div>
              ) : null}
              {order.discountTotal ? (
                <div className="flex justify-between text-sm font-semibold text-[var(--muted)]">
                  <span>Descuento</span>
                  <span>-{formatMoney(order.discountTotal)}</span>
                </div>
              ) : null}
              <div className="grid gap-1 rounded-2xl bg-[var(--primary)] px-4 py-3 text-[var(--color-on-primary)] sm:flex sm:items-center sm:justify-between">
                <span className="text-sm font-black">Total</span>
                <span className="text-xl font-black leading-tight">{formatMoney(order.total)}</span>
              </div>
              {restaurant.whatsapp ? (
                <a
                  className="flex min-h-11 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-black text-[var(--primary)] transition hover:border-[var(--primary)]"
                  href={`https://wa.me/${restaurant.whatsapp.replace(/\D/g, "")}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  Contactar restaurante
                </a>
              ) : null}
            </div>
          </Card>
        </aside>
      </main>
    </RestaurantLayout>
  );
}

function OrderItemsList({ items }: { items: OrderItem[] }) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div className="flex justify-between gap-3 rounded-2xl bg-[var(--color-surface)] p-3 text-sm" key={item.id}>
          <span className="min-w-0 font-semibold text-[var(--text)]">
            {item.quantity}x {item.productName}
            {item.notes ? <span className="block text-xs font-semibold leading-5 text-[var(--muted)]">{item.notes}</span> : null}
          </span>
          <span className="shrink-0 font-black text-[var(--text)]">{formatMoney(item.subtotal)}</span>
        </div>
      ))}
    </div>
  );
}
