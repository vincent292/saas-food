import { notFound } from "next/navigation";
import { RestaurantLayout } from "@/components/layout/RestaurantLayout";
import { OrderTrackingLiveRefresh } from "@/components/orders/OrderTrackingLiveRefresh";
import { ClearCartOnOrderSuccess } from "@/components/public-menu/ClearCartOnOrderSuccess";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { orderService } from "@/lib/services/order.service";
import { restaurantService } from "@/lib/services/restaurant.service";
import { formatMoney } from "@/lib/utils/money";

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
  searchParams: Promise<{ token?: string }>;
}) {
  const [{ restaurantSlug, orderId }, { token }] = await Promise.all([params, searchParams]);
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
      <main className="mx-auto grid max-w-6xl gap-6 px-4 pb-16 pt-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-8 lg:pt-8">
        <section className="min-w-0">
          <OrderTrackingLiveRefresh initialOrder={order} initialQueue={queueState} restaurantSlug={restaurantSlug} token={token} />
        </section>

        <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <Card className="overflow-hidden p-0">
            <div className="border-b border-[var(--border)] bg-[var(--color-surface)] p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--primary)]">Resumen</p>
                  <h2 className="mt-2 text-xl font-black leading-tight text-[var(--text)]">Pedido {order.orderNumber}</h2>
                </div>
                <Badge className="border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--primary-dark)]">{orderTypeLabel[order.orderType]}</Badge>
              </div>
              <p className="mt-3 text-sm font-semibold leading-6 text-[var(--muted)]">
                {order.orderType === "pickup"
                  ? "Cuando el estado sea listo para recoger, pasa por el local con este numero."
                  : order.orderType === "delivery"
                    ? "El estado te avisara cuando el pedido salga para entrega."
                    : "El restaurante actualizara el avance del pedido aqui."}
              </p>
            </div>

            <div className="max-h-[360px] space-y-3 overflow-y-auto p-5 lg:max-h-[calc(100vh-360px)]">
              {order.items.map((item) => (
                <div className="flex justify-between gap-3 rounded-2xl bg-[var(--color-surface)] p-3 text-sm" key={item.id}>
                  <span className="min-w-0 font-semibold text-[var(--text)]">
                    {item.quantity}x {item.productName}
                    {item.notes ? <span className="block text-xs font-semibold leading-5 text-[var(--muted)]">{item.notes}</span> : null}
                  </span>
                  <span className="shrink-0 font-black text-[var(--text)]">{formatMoney(item.subtotal)}</span>
                </div>
              ))}
            </div>

            <div className="space-y-3 border-t border-[var(--border)] p-5">
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
              <div className="flex items-center justify-between rounded-2xl bg-[var(--primary)] px-4 py-3 text-[var(--color-on-primary)]">
                <span className="text-sm font-black">Total</span>
                <span className="text-xl font-black">{formatMoney(order.total)}</span>
              </div>
              {restaurant.whatsapp ? (
                <a
                  className="flex min-h-11 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-black text-[var(--primary)] transition hover:border-[var(--primary)]"
                  href={`https://wa.me/${restaurant.whatsapp.replace(/\D/g, "")}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  Contactar soporte
                </a>
              ) : null}
            </div>
          </Card>
        </aside>
      </main>
    </RestaurantLayout>
  );
}
