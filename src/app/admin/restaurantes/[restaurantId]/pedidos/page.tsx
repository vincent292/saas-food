import { notFound } from "next/navigation";
import { updateOrderStatusAction } from "@/app/admin/actions";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Input";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { formatMoney } from "@/lib/utils/money";
import { orderService } from "@/lib/services/order.service";
import { restaurantService } from "@/lib/services/restaurant.service";
import type { OrderStatus } from "@/types/order.types";

const statuses: OrderStatus[] = ["pending", "accepted", "preparing", "ready", "delivered", "cancelled"];

export default async function OrdersPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const restaurant = await restaurantService.getById(restaurantId);

  if (!restaurant) {
    notFound();
  }

  const orders = await orderService.listByRestaurant(restaurant.id);

  return (
    <AdminLayout active="pedidos" restaurantId={restaurant.id} title="Pedidos en vivo">
      <SectionTitle title="Pedidos" description="Pedidos reales con cambio de estado para administración y cocina." />
      <div className="mt-6 grid gap-4">
        {orders.map((order) => (
          <Card className="grid gap-4 lg:grid-cols-[1fr_160px_160px_180px] lg:items-center" key={order.id}>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-black">{order.orderNumber}</h3>
                <OrderStatusBadge status={order.status} />
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {order.customerName || "Cliente"} · {order.orderType} · {order.paymentMethod}
              </p>
              <div className="mt-3 space-y-1 text-sm">
                {order.items.map((item) => (
                  <p key={item.id}>
                    {item.quantity}x {item.productName}
                  </p>
                ))}
              </div>
            </div>
            <p className="font-black">{formatMoney(order.total)}</p>
            <p className="text-sm font-semibold text-slate-500">{order.paymentStatus}</p>
            <form action={updateOrderStatusAction} className="flex gap-2">
              <input name="restaurantId" type="hidden" value={restaurant.id} />
              <input name="restaurantSlug" type="hidden" value={restaurant.slug} />
              <input name="orderId" type="hidden" value={order.id} />
              <input name="source" type="hidden" value="admin" />
              <Select defaultValue={order.status} name="status">
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </Select>
              <button className="rounded-full bg-slate-950 px-4 text-sm font-bold text-white" type="submit">
                Guardar
              </button>
            </form>
          </Card>
        ))}
      </div>
    </AdminLayout>
  );
}
