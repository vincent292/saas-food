import { Badge } from "@/components/ui/Badge";
import type { OrderStatus } from "@/types/order.types";
import { orderStatusLabels } from "./orderPresentation";

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const tone =
    status === "pending"
      ? "bg-amber-50 text-amber-800"
      : status === "accepted"
        ? "bg-emerald-50 text-emerald-800"
        : status === "preparing"
          ? "bg-orange-50 text-orange-700"
          : status === "ready"
            ? "bg-sky-50 text-sky-700"
            : status === "delivered"
              ? "bg-slate-100 text-slate-700"
              : "bg-red-50 text-red-700";

  return <Badge className={tone}>{orderStatusLabels[status]}</Badge>;
}
