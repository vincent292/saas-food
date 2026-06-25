import { Badge } from "@/components/ui/Badge";
import type { OrderStatus } from "@/types/order.types";

const labels: Record<OrderStatus, string> = {
  pending: "Pendiente",
  accepted: "Aceptado",
  preparing: "Preparando",
  ready: "Listo",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge>{labels[status]}</Badge>;
}
