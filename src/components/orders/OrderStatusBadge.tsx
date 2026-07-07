import { Badge } from "@/components/ui/Badge";
import type { OrderStatus } from "@/types/order.types";
import { orderStatusLabels } from "./orderPresentation";

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const tone =
    status === "pending"
      ? "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]"
      : status === "accepted"
        ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]"
        : status === "preparing"
          ? "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]"
          : status === "ready"
            ? "bg-[var(--color-info-soft)] text-[var(--color-info-strong)]"
            : status === "delivered"
              ? "bg-[var(--color-neutral-100)] text-[var(--color-body)]"
              : "bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]";

  return <Badge className={tone}>{orderStatusLabels[status]}</Badge>;
}
