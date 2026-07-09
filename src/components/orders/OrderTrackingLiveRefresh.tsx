"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChefHat, ClipboardCheck, PackageCheck, Truck, XCircle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { IllustrationAsset } from "@/components/ui/IllustrationAsset";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { VirtualQueueCard } from "@/components/orders/VirtualQueueCard";
import { Badge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";
import type { Order, OrderDeliveryDispatch, OrderQueueState, OrderStatus, OrderTrackingStatus } from "@/types/order.types";

const POLL_INTERVAL_MS = 30000;
const terminalStatuses = new Set<OrderStatus>(["delivered", "cancelled"]);

const trackingLabels: Record<OrderStatus, string> = {
  pending: "Recibido",
  accepted: "Confirmado",
  preparing: "Preparando",
  ready: "Listo",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

type DeliveryChangePayload = {
  status?: OrderDeliveryDispatch["status"];
  opened_at?: string | null;
  arrived_at?: string | null;
  delivered_at?: string | null;
};

type OrderChangePayload = {
  status?: OrderStatus;
  accepted_at?: string | null;
  preparing_at?: string | null;
  ready_at?: string | null;
  delivered_at?: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  updated_at?: string | null;
};

function hasDeliveryDispatch(order: Order) {
  return Boolean(order.deliveryDispatch && ["active", "arrived", "delivered"].includes(order.deliveryDispatch.status));
}

function isTerminalStatus(status: OrderStatus) {
  return terminalStatuses.has(status);
}

function trackingLabel(order: Order) {
  if (order.orderType === "delivery" && order.status === "ready" && hasDeliveryDispatch(order)) {
    return "Salio para entrega";
  }

  return trackingLabels[order.status];
}

function mergeTrackingStatus(order: Order, status: OrderTrackingStatus): Order {
  return {
    ...order,
    orderType: status.orderType,
    status: status.status,
    acceptedAt: status.acceptedAt,
    preparingAt: status.preparingAt,
    readyAt: status.readyAt,
    deliveredAt: status.deliveredAt,
    cancelledAt: status.cancelledAt,
    cancellationReason: status.cancellationReason,
    deliveryDispatch: status.deliveryDispatch
      ? {
          ...order.deliveryDispatch,
          ...status.deliveryDispatch,
        }
      : order.deliveryDispatch,
  };
}

function mergeOrderChange(order: Order, payload: OrderChangePayload): Order {
  return {
    ...order,
    status: payload.status ?? order.status,
    acceptedAt: payload.accepted_at ?? order.acceptedAt,
    preparingAt: payload.preparing_at ?? order.preparingAt,
    readyAt: payload.ready_at ?? order.readyAt,
    deliveredAt: payload.delivered_at ?? order.deliveredAt,
    cancelledAt: payload.cancelled_at ?? order.cancelledAt,
    cancellationReason: payload.cancellation_reason ?? order.cancellationReason,
  };
}

function mergeDeliveryChange(order: Order, payload: DeliveryChangePayload): Order {
  if (!payload.status) {
    return order;
  }

  return {
    ...order,
    deliveryDispatch: {
      ...order.deliveryDispatch,
      status: payload.status,
      openedAt: payload.opened_at ?? order.deliveryDispatch?.openedAt,
      arrivedAt: payload.arrived_at ?? order.deliveryDispatch?.arrivedAt,
      deliveredAt: payload.delivered_at ?? order.deliveryDispatch?.deliveredAt,
    },
  };
}

function trackingSteps(order: Order) {
  const isDelivery = order.orderType === "delivery";
  const steps = isDelivery
    ? [
        { label: "Recibido", icon: CheckCircle2 },
        { label: "Confirmado", icon: ClipboardCheck },
        { label: "Preparando", icon: ChefHat },
        { label: "Listo", icon: PackageCheck },
        { label: "Salio para entrega", icon: Truck },
        { label: "Entregado", icon: PackageCheck },
      ]
    : [
        { label: "Recibido", icon: CheckCircle2 },
        { label: "Confirmado", icon: ClipboardCheck },
        { label: "Preparando", icon: ChefHat },
        { label: "Listo", icon: Truck },
        { label: "Entregado", icon: PackageCheck },
      ];

  const currentStep =
    order.status === "cancelled"
      ? -1
      : isDelivery
        ? order.status === "delivered"
          ? 5
          : order.status === "ready" && hasDeliveryDispatch(order)
            ? 4
            : order.status === "ready"
              ? 3
              : order.status === "preparing"
                ? 2
                : order.status === "accepted"
                  ? 1
                  : 0
        : order.status === "delivered"
          ? 4
          : order.status === "ready"
            ? 3
            : order.status === "preparing"
              ? 2
              : order.status === "accepted"
                ? 1
                : 0;

  return { steps, currentStep };
}

function TrackingStatusBadge({ order }: { order: Order }) {
  const tone =
    order.status === "pending"
      ? "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]"
      : order.status === "accepted"
        ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]"
        : order.status === "preparing"
          ? "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]"
          : order.status === "ready"
            ? "bg-[var(--color-info-soft)] text-[var(--color-info-strong)]"
            : order.status === "delivered"
              ? "bg-[var(--color-neutral-100)] text-[var(--color-body)]"
              : "bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]";

  return <Badge className={tone}>{trackingLabel(order)}</Badge>;
}

export function OrderTrackingLiveRefresh({
  initialOrder,
  initialQueue,
  restaurantSlug,
  token,
}: {
  initialOrder: Order;
  initialQueue: OrderQueueState | null;
  restaurantSlug: string;
  token?: string;
}) {
  const [order, setOrder] = useState(initialOrder);
  const statusUrl = useMemo(() => {
    const params = token ? `?token=${encodeURIComponent(token)}` : "";
    return `/r/${restaurantSlug}/pedido/${initialOrder.id}/status${params}`;
  }, [initialOrder.id, restaurantSlug, token]);
  const isTerminal = isTerminalStatus(order.status);
  const { steps, currentStep } = trackingSteps(order);
  const queue = initialQueue ? { ...initialQueue, status: order.status } : null;

  const fetchLatestStatus = useCallback(async () => {
    if (document.visibilityState !== "visible") {
      return;
    }

    try {
      const response = await fetch(statusUrl, { cache: "no-store" });
      if (!response.ok) {
        return;
      }

      const status = (await response.json()) as OrderTrackingStatus;
      setOrder((current) => mergeTrackingStatus(current, status));
    } catch {
      // The next interval or realtime event will try again.
    }
  }, [statusUrl]);

  useEffect(() => {
    if (isTerminal) {
      return;
    }

    const supabase = createClient();
    const channel = supabase
      .channel(`seguimiento-pedido-${initialOrder.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${initialOrder.id}` }, (payload) => {
        setOrder((current) => mergeOrderChange(current, payload.new as OrderChangePayload));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "order_delivery_links", filter: `order_id=eq.${initialOrder.id}` }, (payload) => {
        setOrder((current) => mergeDeliveryChange(current, payload.new as DeliveryChangePayload));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [initialOrder.id, isTerminal]);

  useEffect(() => {
    if (isTerminal) {
      return;
    }

    let intervalId: number | undefined;
    const stopPolling = () => {
      if (intervalId) {
        window.clearInterval(intervalId);
        intervalId = undefined;
      }
    };
    const startPolling = () => {
      if (intervalId || document.visibilityState !== "visible") {
        return;
      }
      intervalId = window.setInterval(fetchLatestStatus, POLL_INTERVAL_MS);
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void fetchLatestStatus();
        startPolling();
      } else {
        stopPolling();
      }
    };

    startPolling();
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      stopPolling();
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [fetchLatestStatus, isTerminal]);

  return (
    <>
      <SectionTitle title="Seguimiento del pedido" description={`Pedido ${order.orderNumber}`} action={<TrackingStatusBadge order={order} />} />

      <Card className="mt-6 overflow-hidden">
        {order.status === "cancelled" ? (
          <div className="rounded-3xl bg-[var(--color-danger-soft)] p-5 text-center text-[var(--color-danger-strong)]">
            <XCircle className="mx-auto h-10 w-10" />
            <p className="mt-3 text-lg font-black">Pedido cancelado</p>
            <p className="mt-2 text-sm font-semibold">{order.cancellationReason || "El equipo no pudo aprobar tu pedido."}</p>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[230px_1fr] lg:items-center">
            <div className="rounded-[1.5rem] bg-[var(--primary-light)] p-4 text-center">
              <IllustrationAsset className="mx-auto max-w-[210px]" name={order.status === "delivered" ? "orderSuccess" : "orderStatus"} priority sizes="210px" />
              <p className="mt-3 text-sm font-black text-[var(--primary)]">{order.status === "delivered" ? "Pedido entregado" : "Seguimiento por estados"}</p>
              <p className="mt-1 text-xs font-semibold text-[var(--muted)]">Sin mapa en vivo ni ubicacion del repartidor.</p>
            </div>
            <div className={cn("grid gap-4", order.orderType === "delivery" ? "md:grid-cols-6" : "md:grid-cols-5")}>
              {steps.map((step, index) => {
                const done = currentStep > index;
                const active = currentStep === index;
                return (
                  <div
                    className={cn(
                      "rounded-3xl border p-4 text-center transition",
                      done && "border-[var(--primary)] bg-[var(--primary)] text-[var(--color-on-primary)]",
                      active && "border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary-dark)] ring-2 ring-[var(--primary)]/15",
                      !done && !active && "border-transparent bg-[var(--color-surface)] text-[var(--muted)]",
                    )}
                    key={step.label}
                  >
                    <step.icon className={cn("mx-auto h-8 w-8", done ? "text-[var(--color-on-primary)]" : active ? "text-[var(--primary)]" : "text-[var(--color-placeholder)]")} />
                    <p className="mt-3 text-sm font-black">{step.label}</p>
                    <p className={cn("mt-1 text-xs font-semibold", done ? "text-[var(--color-on-primary-muted)]" : "text-[var(--muted)]")}>{active ? "Ahora" : `Paso ${index + 1}`}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      <VirtualQueueCard order={order} queue={queue} />
    </>
  );
}
