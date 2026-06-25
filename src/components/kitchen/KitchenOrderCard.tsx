import { Clock, Flame } from "lucide-react";
import { updateOrderStatusAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatShortTime } from "@/lib/utils/dates";
import type { Order } from "@/types/order.types";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";

export function KitchenOrderCard({ order, restaurantSlug }: { order: Order; restaurantSlug: string }) {
  const nextStatus = order.status === "pending" ? "accepted" : order.status === "accepted" ? "preparing" : order.status === "preparing" ? "ready" : "delivered";

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--muted)]">Pedido {order.orderNumber}</p>
          <h3 className="text-xl font-black text-[var(--text)]">{order.orderType === "table" ? "Mesa" : order.orderType}</h3>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>
      <div className="space-y-2">
        {order.items.map((item) => (
          <div className="rounded-2xl bg-slate-50 p-3" key={item.id}>
            <p className="font-bold text-[var(--text)]">
              {item.quantity}x {item.productName}
            </p>
            {item.notes ? <p className="text-sm text-[var(--muted)]">{item.notes}</p> : null}
          </div>
        ))}
      </div>
      {order.notes ? <p className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-800">{order.notes}</p> : null}
      <div className="flex items-center gap-2 text-xs font-semibold text-[var(--muted)]">
        <Clock className="h-4 w-4" />
        Ingresó {formatShortTime(order.createdAt)}
      </div>
      <form action={updateOrderStatusAction} className="grid grid-cols-2 gap-2">
        <input name="restaurantId" type="hidden" value={order.restaurantId} />
        <input name="restaurantSlug" type="hidden" value={restaurantSlug} />
        <input name="orderId" type="hidden" value={order.id} />
        <input name="source" type="hidden" value="kitchen" />
        <Button name="status" type="submit" value={nextStatus} variant="secondary">
          Avanzar
        </Button>
        <Button name="status" type="submit" value="ready">
          <Flame className="h-4 w-4" />
          Listo
        </Button>
      </form>
    </Card>
  );
}
