import { notFound } from "next/navigation";
import { RestaurantLayout } from "@/components/layout/RestaurantLayout";
import { OrderTrackingLiveRefresh } from "@/components/orders/OrderTrackingLiveRefresh";
import { ClearCartOnOrderSuccess } from "@/components/public-menu/ClearCartOnOrderSuccess";
import { Card } from "@/components/ui/Card";
import { orderService } from "@/lib/services/order.service";
import { restaurantService } from "@/lib/services/restaurant.service";
import { formatMoney } from "@/lib/utils/money";

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
      <ClearCartOnOrderSuccess enabled={Boolean(token)} />
      <main className="mx-auto max-w-4xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
        <OrderTrackingLiveRefresh initialOrder={order} initialQueue={queueState} restaurantSlug={restaurantSlug} token={token} />

        <Card className="mt-6">
          <h2 className="text-xl font-black">Resumen</h2>
          <div className="mt-4 space-y-3">
            {order.items.map((item) => (
              <div className="flex justify-between gap-3 text-sm" key={item.id}>
                <span>
                  {item.quantity}x {item.productName}
                  {item.notes ? <span className="block text-xs font-semibold text-[var(--muted)]">{item.notes}</span> : null}
                </span>
                <span className="font-bold">{formatMoney(item.subtotal)}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-between border-t border-[var(--border)] pt-4 text-xl font-black">
            <span>Total</span>
            <span>{formatMoney(order.total)}</span>
          </div>
        </Card>
      </main>
    </RestaurantLayout>
  );
}
