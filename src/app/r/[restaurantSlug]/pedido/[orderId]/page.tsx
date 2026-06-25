import { notFound } from "next/navigation";
import { CheckCircle2, ChefHat, PackageCheck, Truck } from "lucide-react";
import { RestaurantLayout } from "@/components/layout/RestaurantLayout";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { ClearCartOnOrderSuccess } from "@/components/public-menu/ClearCartOnOrderSuccess";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { formatMoney } from "@/lib/utils/money";
import { orderService } from "@/lib/services/order.service";
import { restaurantService } from "@/lib/services/restaurant.service";

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

  const order = token ? await orderService.getPublicByTracking(restaurant.id, orderId, token) : await orderService.getById(restaurant.id, orderId);

  if (!order) {
    notFound();
  }

  const steps = [
    { label: "Pedido recibido", icon: CheckCircle2 },
    { label: "En preparación", icon: ChefHat },
    { label: order.orderType === "delivery" ? "En camino" : "Listo para recoger", icon: Truck },
    { label: "Entregado", icon: PackageCheck },
  ];

  return (
    <RestaurantLayout restaurant={restaurant}>
      <ClearCartOnOrderSuccess enabled={Boolean(token)} />
      <main className="mx-auto max-w-4xl px-4 pb-28 pt-8 sm:px-6 lg:px-8">
        <SectionTitle title="Seguimiento del pedido" description={`Pedido ${order.orderNumber}`} action={<OrderStatusBadge status={order.status} />} />
        <Card className="mt-6">
          <div className="grid gap-4 md:grid-cols-4">
            {steps.map((step, index) => (
              <div className="rounded-3xl bg-[var(--primary-light)] p-4 text-center" key={step.label}>
                <step.icon className="mx-auto h-8 w-8 text-[var(--primary)]" />
                <p className="mt-3 text-sm font-black">{step.label}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">Paso {index + 1}</p>
              </div>
            ))}
          </div>
        </Card>
        <Card className="mt-6">
          <h2 className="text-xl font-black">Resumen</h2>
          <div className="mt-4 space-y-3">
            {order.items.map((item) => (
              <div className="flex justify-between gap-3 text-sm" key={item.id}>
                <span>
                  {item.quantity}x {item.productName}
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
