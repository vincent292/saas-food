import { notFound } from "next/navigation";
import { CheckCircle2, ChefHat, PackageCheck, Truck, XCircle } from "lucide-react";
import { RestaurantLayout } from "@/components/layout/RestaurantLayout";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { OrderTrackingLiveRefresh } from "@/components/orders/OrderTrackingLiveRefresh";
import { ClearCartOnOrderSuccess } from "@/components/public-menu/ClearCartOnOrderSuccess";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { orderService } from "@/lib/services/order.service";
import { restaurantService } from "@/lib/services/restaurant.service";
import { cn } from "@/lib/utils/cn";
import { formatMoney } from "@/lib/utils/money";
import type { OrderStatus } from "@/types/order.types";

const statusStep: Record<OrderStatus, number> = {
  pending: 0,
  accepted: 1,
  preparing: 1,
  ready: 2,
  delivered: 3,
  cancelled: -1,
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

  const order = token ? await orderService.getPublicByTracking(restaurant.id, orderId, token) : await orderService.getById(restaurant.id, orderId);

  if (!order) {
    notFound();
  }

  const currentStep = statusStep[order.status];
  const steps = [
    { label: "Pedido recibido", icon: CheckCircle2 },
    { label: "En preparacion", icon: ChefHat },
    { label: order.orderType === "delivery" ? "En camino" : "Listo para recoger", icon: Truck },
    { label: "Entregado", icon: PackageCheck },
  ];

  return (
    <RestaurantLayout restaurant={restaurant} showCart={false} showMobileNav={false}>
      <OrderTrackingLiveRefresh orderId={order.id} restaurantId={restaurant.id} />
      <ClearCartOnOrderSuccess enabled={Boolean(token)} />
      <main className="mx-auto max-w-4xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
        <SectionTitle title="Seguimiento del pedido" description={`Pedido ${order.orderNumber}`} action={<OrderStatusBadge status={order.status} />} />

        <Card className="mt-6">
          {order.status === "cancelled" ? (
            <div className="rounded-3xl bg-red-50 p-5 text-center text-red-700">
              <XCircle className="mx-auto h-10 w-10" />
              <p className="mt-3 text-lg font-black">Pedido rechazado</p>
              <p className="mt-2 text-sm font-semibold">{order.cancellationReason || "El equipo no pudo aprobar tu pedido."}</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-4">
              {steps.map((step, index) => {
                const done = currentStep > index;
                const active = currentStep === index;
                return (
                  <div
                    className={cn(
                      "rounded-3xl border p-4 text-center transition",
                      done && "border-[var(--primary)] bg-[var(--primary)] text-white",
                      active && "border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary-dark)] ring-2 ring-[var(--primary)]/15",
                      !done && !active && "border-transparent bg-slate-50 text-[var(--muted)]",
                    )}
                    key={step.label}
                  >
                    <step.icon className={cn("mx-auto h-8 w-8", done ? "text-white" : active ? "text-[var(--primary)]" : "text-slate-400")} />
                    <p className="mt-3 text-sm font-black">{step.label}</p>
                    <p className={cn("mt-1 text-xs font-semibold", done ? "text-white/80" : "text-[var(--muted)]")}>{active ? "Ahora" : `Paso ${index + 1}`}</p>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

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
