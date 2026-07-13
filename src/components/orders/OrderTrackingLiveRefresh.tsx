"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChefHat, ClipboardCheck, Clock3, PackageCheck, ShoppingBag, Store, Truck, XCircle } from "lucide-react";
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

const pickupLabels: Record<OrderStatus, string> = {
  pending: "Recibido",
  accepted: "Confirmado",
  preparing: "Preparando",
  ready: "Listo para recoger",
  delivered: "Retirado",
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
  if (order.orderType === "pickup") {
    return pickupLabels[order.status];
  }

  if (order.orderType === "delivery" && order.status === "ready" && hasDeliveryDispatch(order)) {
    return "Salio para entrega";
  }

  return trackingLabels[order.status];
}

function trackingHeroCopy(order: Order) {
  if (order.orderType === "pickup") {
    if (order.status === "ready") {
      return {
        title: "Listo para recoger",
        description: "Tu pedido ya esta listo. Puedes pasar por el local y pedirlo con tu numero de pedido.",
        mode: "Recojo en local",
      };
    }

    if (order.status === "delivered") {
      return {
        title: "Pedido retirado",
        description: "Gracias por pasar por el local. El pedido quedo marcado como completado.",
        mode: "Recojo completado",
      };
    }

    return {
      title: "Te avisaremos cuando este listo",
      description: "Sigue el avance de cocina aqui. El estado importante para recojo es listo para recoger.",
      mode: "Recojo en local",
    };
  }

  if (order.orderType === "delivery") {
    if (order.status === "ready" && hasDeliveryDispatch(order)) {
      return {
        title: "Salio para entrega",
        description: "El repartidor ya tiene el pedido. El seguimiento se mantiene por estados, sin mapa en vivo.",
        mode: "Envio a domicilio",
      };
    }

    if (order.status === "ready") {
      return {
        title: "Listo para envio",
        description: "El restaurante ya termino la preparacion y esta coordinando el despacho.",
        mode: "Envio a domicilio",
      };
    }

    return {
      title: order.status === "delivered" ? "Pedido entregado" : "Seguimiento por estados",
      description: "Veras el avance del pedido y el momento en que salga para entrega.",
      mode: "Envio a domicilio",
    };
  }

  return {
    title: order.status === "delivered" ? "Pedido completado" : "Seguimiento por estados",
    description: "El restaurante actualizara el avance del pedido aqui.",
    mode: "Pedido en local",
  };
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
  const isPickup = order.orderType === "pickup";
  const steps = isDelivery
    ? [
        { label: "Recibido", description: "El restaurante recibio tu pedido.", icon: CheckCircle2 },
        { label: "Confirmado", description: "El equipo lo aprobo.", icon: ClipboardCheck },
        { label: "Preparando", description: "Cocina esta trabajando.", icon: ChefHat },
        { label: "Listo", description: "Sale del local.", icon: PackageCheck },
        { label: "Salio para entrega", description: "Va camino a tu direccion.", icon: Truck },
        { label: "Entregado", description: "Pedido completado.", icon: PackageCheck },
      ]
    : isPickup
      ? [
          { label: "Recibido", description: "El restaurante recibio tu pedido.", icon: CheckCircle2 },
          { label: "Confirmado", description: "El equipo lo aprobo.", icon: ClipboardCheck },
          { label: "Preparando", description: "Cocina esta trabajando.", icon: ChefHat },
          { label: "Listo para recoger", description: "Ya puedes pasar por el local.", icon: ShoppingBag },
          { label: "Retirado", description: "Pedido completado.", icon: Store },
        ]
      : [
          { label: "Recibido", description: "El restaurante recibio tu pedido.", icon: CheckCircle2 },
          { label: "Confirmado", description: "El equipo lo aprobo.", icon: ClipboardCheck },
          { label: "Preparando", description: "Cocina esta trabajando.", icon: ChefHat },
          { label: "Listo", description: "El pedido esta listo.", icon: PackageCheck },
          { label: "Completado", description: "Pedido completado.", icon: Store },
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
  const heroCopy = trackingHeroCopy(order);
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

      <Card className="mt-6 max-w-full overflow-hidden">
        {order.status === "cancelled" ? (
          <div className="rounded-3xl bg-[var(--color-danger-soft)] p-5 text-center text-[var(--color-danger-strong)]">
            <XCircle className="mx-auto h-10 w-10" />
            <p className="mt-3 text-lg font-black">Pedido cancelado</p>
            <p className="mt-2 text-sm font-semibold">{order.cancellationReason || "El equipo no pudo aprobar tu pedido."}</p>
          </div>
        ) : (
          <div className="grid min-w-0 gap-5 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start">
            <div className="min-w-0 rounded-[1.5rem] border border-[var(--border)] bg-[var(--color-surface)] p-4 text-center">
              <IllustrationAsset className="mx-auto max-w-[190px]" name={order.status === "delivered" ? "orderSuccess" : "orderStatus"} priority sizes="190px" />
              <Badge className="mt-3 border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--primary-dark)]">{heroCopy.mode}</Badge>
              <p className="mt-3 text-base font-black leading-tight text-[var(--primary)]">{heroCopy.title}</p>
              <p className="mx-auto mt-2 max-w-[15rem] break-words text-xs font-semibold leading-5 text-[var(--muted)] sm:max-w-[18rem]">{heroCopy.description}</p>
            </div>
            <div className="grid min-w-0 gap-3 md:grid-cols-2 lg:grid-cols-1">
              {steps.map((step, index) => {
                const done = currentStep > index;
                const active = currentStep === index;
                return (
                  <div
                    className={cn(
                      "flex min-h-20 min-w-0 items-center gap-3 rounded-2xl border p-3 text-left transition md:block md:min-h-[136px] md:p-4 md:text-center lg:flex lg:min-h-[76px] lg:p-3 lg:text-left",
                      done && "border-[var(--primary)] bg-[var(--primary)] text-[var(--color-on-primary)]",
                      active && "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--primary-dark)] ring-2 ring-[var(--accent-ring)]",
                      !done && !active && "border-transparent bg-[var(--color-surface)] text-[var(--muted)]",
                    )}
                    key={step.label}
                  >
                    <span
                      className={cn(
                        "grid h-11 w-11 shrink-0 place-items-center rounded-2xl md:mx-auto lg:mx-0",
                        done && "bg-[var(--color-on-primary-soft)]",
                        active && "bg-[var(--surface)]",
                        !done && !active && "bg-[var(--surface)]",
                      )}
                    >
                      <step.icon className={cn("h-6 w-6", done ? "text-[var(--color-on-primary)]" : active ? "text-[var(--primary)]" : "text-[var(--color-placeholder)]")} />
                    </span>
                    <span className="min-w-0 lg:flex-1">
                      <p className="text-sm font-black leading-tight md:mt-3 lg:mt-0">{step.label}</p>
                      <p className={cn("mt-1 text-xs font-semibold leading-5", done ? "text-[var(--color-on-primary-muted)]" : "text-[var(--muted)]")}>
                        {active ? "Ahora" : step.description}
                      </p>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      {order.status !== "cancelled" ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex items-center gap-2 text-sm font-black text-[var(--text)]">
              <Clock3 className="h-4 w-4 text-[var(--primary)]" />
              Actualizacion
            </div>
            <p className="mt-2 text-xs font-semibold leading-5 text-[var(--muted)]">Se refresca automaticamente sin recargar toda la pagina.</p>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex items-center gap-2 text-sm font-black text-[var(--text)]">
              {order.orderType === "delivery" ? <Truck className="h-4 w-4 text-[var(--primary)]" /> : <Store className="h-4 w-4 text-[var(--primary)]" />}
              {order.orderType === "delivery" ? "Entrega" : "Recojo"}
            </div>
            <p className="mt-2 text-xs font-semibold leading-5 text-[var(--muted)]">
              {order.orderType === "delivery" ? "El estado avisara cuando salga para entrega." : "El estado avisara cuando este listo para pasar por el local."}
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex items-center gap-2 text-sm font-black text-[var(--text)]">
              <PackageCheck className="h-4 w-4 text-[var(--primary)]" />
              Estado claro
            </div>
            <p className="mt-2 text-xs font-semibold leading-5 text-[var(--muted)]">Sin mapa en vivo ni ubicacion del repartidor.</p>
          </div>
        </div>
      ) : null}

      <VirtualQueueCard order={order} queue={queue} />
    </>
  );
}
