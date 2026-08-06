"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChefHat, ClipboardCheck, MessageCircle, PackageCheck, Phone, ReceiptText, ShoppingBag, Store, Truck, XCircle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { IllustrationAsset } from "@/components/ui/IllustrationAsset";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { VirtualQueueCard } from "@/components/orders/VirtualQueueCard";
import { Badge } from "@/components/ui/Badge";
import { businessPickupReadyLabel, businessTypeSupportsKitchen } from "@/lib/restaurant-directory-options";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";
import { publicRestaurantPath } from "@/lib/utils/public-routes";
import type { Order, OrderDeliveryDispatch, OrderQueueState, OrderStatus, OrderTrackingStatus } from "@/types/order.types";
import type { BusinessType } from "@/types/restaurant.types";

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

const tableLabels: Record<OrderStatus, string> = {
  pending: "Pendiente de pago",
  accepted: "Pagado",
  preparing: "Preparando",
  ready: "Listo",
  delivered: "Servido",
  cancelled: "Cancelado",
};

type DeliveryChangePayload = {
  status?: OrderDeliveryDispatch["status"];
  delivery_phone?: string | null;
  delivery_name?: string | null;
  created_at?: string | null;
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

function isTerminalOrder(order: Order) {
  return terminalStatuses.has(order.status) || order.deliveryDispatch?.status === "delivered";
}

function trackingLabel(order: Order & { businessType?: BusinessType }) {
  if (order.orderType === "table") {
    return tableLabels[order.status];
  }

  if (order.orderType === "pickup") {
    if (order.status === "ready") {
      return businessPickupReadyLabel(order.businessType ?? "food");
    }
    return pickupLabels[order.status];
  }

  if (order.orderType === "delivery" && order.deliveryDispatch?.status === "arrived") {
    return "Llego";
  }

  return trackingLabels[order.status];
}

function digitsOnly(value?: string) {
  return (value ?? "").replace(/\D/g, "");
}

function formatDuration(milliseconds: number) {
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours} h ${minutes} min`;
  }

  return `${minutes} min`;
}

function deliveryElapsedLabel(order: Order) {
  const startedAt = order.deliveryDispatch?.dispatchedAt ?? order.deliveryDispatch?.openedAt;
  if (!startedAt) {
    return "";
  }

  const endedAt = order.deliveryDispatch?.arrivedAt ?? order.deliveryDispatch?.deliveredAt;
  const elapsedMs = new Date(endedAt ?? Date.now()).getTime() - new Date(startedAt).getTime();
  return formatDuration(elapsedMs);
}

function formatScheduledFulfillment(value?: string) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("es-BO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/La_Paz",
  }).format(date);
}

function trackingHeroCopy(order: Order, businessType: BusinessType) {
  const scheduledFulfillment = formatScheduledFulfillment(order.requestedFulfillmentAt);

  if (scheduledFulfillment && order.status === "pending" && (order.orderType === "pickup" || order.orderType === "delivery")) {
    return {
      title: "Pedido programado recibido",
      description: `Tu pedido fue recibido y se preparara para ${scheduledFulfillment}. El restaurante lo aprobara cuando este listo para operarlo.`,
      mode: order.orderType === "delivery" ? "Envio programado" : "Recojo programado",
    };
  }

  if (order.orderType === "pickup") {
    if (order.status === "ready") {
      return {
        title: businessPickupReadyLabel(businessType),
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
      description: `Sigue el avance del pedido aqui. El estado importante para recojo es ${businessPickupReadyLabel(businessType).toLowerCase()}.`,
      mode: "Recojo en local",
    };
  }

  if (order.orderType === "delivery") {
    if (order.deliveryDispatch?.status === "arrived") {
      return {
        title: "El repartidor ya llego",
        description: "El repartidor marco llegada en tu ubicacion. Si falta coordinar algo, puedes contactarlo.",
        mode: "Envio a domicilio",
      };
    }

    if (order.status === "ready" && hasDeliveryDispatch(order)) {
      return {
        title: "Pedido en camino",
        description: "El repartidor ya tiene el pedido. Te avisaremos cuando marque llegada.",
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

  if (order.orderType === "table") {
    if (order.status === "pending") {
      return {
        title: "Pendiente de pago en caja",
        description: "Acercate a caja con tu numero de pedido para que el equipo lo confirme y pase a cocina.",
        mode: "Pedido en mesa",
      };
    }

    if (order.status === "delivered") {
      return {
        title: "Pedido servido",
        description: "Tu pedido quedo completado en mesa. Gracias por visitarnos.",
        mode: "Mesa atendida",
      };
    }

    return {
      title: "Seguimiento de mesa",
      description: "Veras cuando caja confirme, cocina prepare y el pedido quede listo para servir.",
      mode: "Pedido en mesa",
    };
  }

  return {
    title: order.status === "delivered" ? "Pedido completado" : "Seguimiento por estados",
    description: "El restaurante actualizara el avance del pedido aqui.",
    mode: "Pedido en local",
  };
}

function mergeTrackingStatus<T extends Order>(order: T, status: OrderTrackingStatus): T {
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
  } as T;
}

function mergeOrderChange<T extends Order>(order: T, payload: OrderChangePayload): T {
  return {
    ...order,
    status: payload.status ?? order.status,
    acceptedAt: payload.accepted_at ?? order.acceptedAt,
    preparingAt: payload.preparing_at ?? order.preparingAt,
    readyAt: payload.ready_at ?? order.readyAt,
    deliveredAt: payload.delivered_at ?? order.deliveredAt,
    cancelledAt: payload.cancelled_at ?? order.cancelledAt,
    cancellationReason: payload.cancellation_reason ?? order.cancellationReason,
  } as T;
}

function mergeDeliveryChange<T extends Order>(order: T, payload: DeliveryChangePayload): T {
  if (!payload.status) {
    return order;
  }

  return {
    ...order,
    deliveryDispatch: {
      ...order.deliveryDispatch,
      status: payload.status,
      deliveryPhone: payload.delivery_phone ?? order.deliveryDispatch?.deliveryPhone,
      deliveryName: payload.delivery_name ?? order.deliveryDispatch?.deliveryName,
      dispatchedAt: payload.created_at ?? order.deliveryDispatch?.dispatchedAt,
      openedAt: payload.opened_at ?? order.deliveryDispatch?.openedAt,
      arrivedAt: payload.arrived_at ?? order.deliveryDispatch?.arrivedAt,
      deliveredAt: payload.delivered_at ?? order.deliveryDispatch?.deliveredAt,
    },
  } as T;
}

function trackingSteps(order: Order & { businessType?: BusinessType }) {
  const isDelivery = order.orderType === "delivery";
  const isPickup = order.orderType === "pickup";
  const isTable = order.orderType === "table";
  const isFood = businessTypeSupportsKitchen(order.businessType);
  const preparingDescription = isFood ? "Cocina esta trabajando." : "Estamos preparando tu pedido.";
  const pickupReadyLabel = businessPickupReadyLabel(order.businessType ?? "food");
  const steps = isDelivery
    ? [
        { label: "Recibido", description: "El restaurante recibio tu pedido.", icon: CheckCircle2 },
        { label: "Confirmado", description: "El equipo lo aprobo.", icon: ClipboardCheck },
        { label: "Preparando", description: preparingDescription, icon: isFood ? ChefHat : ShoppingBag },
        { label: "Listo", description: "Sale del local.", icon: PackageCheck },
        { label: "Llego", description: "El repartidor marco llegada.", icon: Truck },
        { label: "Entregado", description: "Pedido completado.", icon: PackageCheck },
      ]
    : isPickup
      ? [
          { label: "Recibido", description: "El restaurante recibio tu pedido.", icon: CheckCircle2 },
          { label: "Confirmado", description: "El equipo lo aprobo.", icon: ClipboardCheck },
          { label: "Preparando", description: preparingDescription, icon: isFood ? ChefHat : ShoppingBag },
          { label: pickupReadyLabel, description: "Ya puedes pasar por el local.", icon: ShoppingBag },
          { label: "Retirado", description: "Pedido completado.", icon: Store },
        ]
      : isTable
        ? [
            { label: "Pendiente de pago", description: "Acercate a caja para confirmar.", icon: ReceiptText },
            { label: "Pagado", description: "Caja confirmo tu pedido.", icon: ClipboardCheck },
            { label: "Preparando", description: preparingDescription, icon: isFood ? ChefHat : ShoppingBag },
            { label: "Listo", description: "El pedido ya esta listo para servir.", icon: PackageCheck },
            { label: "Servido", description: "Pedido completado en mesa.", icon: Store },
          ]
      : [
          { label: "Recibido", description: "El restaurante recibio tu pedido.", icon: CheckCircle2 },
          { label: "Confirmado", description: "El equipo lo aprobo.", icon: ClipboardCheck },
          { label: "Preparando", description: preparingDescription, icon: isFood ? ChefHat : ShoppingBag },
          { label: "Listo", description: "El pedido esta listo.", icon: PackageCheck },
          { label: "Completado", description: "Pedido completado.", icon: Store },
        ];

  const currentStep =
    order.status === "cancelled"
      ? -1
      : isDelivery
        ? order.status === "delivered"
          ? 5
          : order.deliveryDispatch?.status === "delivered"
            ? 5
            : order.deliveryDispatch?.status === "arrived"
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
  businessType,
  token,
}: {
  initialOrder: Order;
  initialQueue: OrderQueueState | null;
  restaurantSlug: string;
  businessType: BusinessType;
  token?: string;
}) {
  const [order, setOrder] = useState<Order & { businessType: BusinessType }>({ ...initialOrder, businessType });
  const statusUrl = useMemo(() => {
    const params = token ? `?token=${encodeURIComponent(token)}` : "";
    return `${publicRestaurantPath(restaurantSlug, `pedido/${initialOrder.id}/status`)}${params}`;
  }, [initialOrder.id, restaurantSlug, token]);
  const isTerminal = isTerminalOrder(order);
  const { steps, currentStep } = trackingSteps(order);
  const heroCopy = trackingHeroCopy(order, businessType);
  const queue = initialQueue ? { ...initialQueue, status: order.status } : null;
  const deliveryPhoneDigits = digitsOnly(order.deliveryDispatch?.deliveryPhone);
  const deliveryWhatsappUrl = deliveryPhoneDigits
    ? `https://wa.me/${deliveryPhoneDigits}?text=${encodeURIComponent(`Hola, soy del pedido ${order.orderNumber}. Quiero saber donde esta mi entrega.`)}`
    : "";
  const deliveryElapsed = order.orderType === "delivery" ? deliveryElapsedLabel(order) : "";

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

      <Card className="mt-4 max-w-full overflow-hidden p-3 sm:p-5 lg:mt-6">
        {order.status === "cancelled" ? (
          <div className="rounded-3xl bg-[var(--color-danger-soft)] p-5 text-center text-[var(--color-danger-strong)]">
            <XCircle className="mx-auto h-10 w-10" />
            <p className="mt-3 text-lg font-black">Pedido cancelado</p>
            <p className="mt-2 text-sm font-semibold">{order.cancellationReason || "El equipo no pudo aprobar tu pedido."}</p>
          </div>
        ) : (
          <div className="grid min-w-0 gap-3 lg:grid-cols-[230px_minmax(0,1fr)] lg:items-start lg:gap-5">
            <div className="flex min-w-0 items-center gap-3 rounded-[1.25rem] border border-[var(--border)] bg-[var(--color-surface)] p-3 text-left lg:block lg:rounded-[1.5rem] lg:p-4 lg:text-center">
              <IllustrationAsset className="h-20 w-20 shrink-0 object-contain sm:h-28 sm:w-28 lg:mx-auto lg:h-auto lg:w-auto lg:max-w-[190px]" name={order.status === "delivered" ? "orderSuccess" : "orderStatus"} priority sizes="190px" />
              <div className="min-w-0">
                <Badge className="border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--primary-dark)] lg:mt-3">{heroCopy.mode}</Badge>
                <p className="mt-2 text-base font-black leading-tight text-[var(--primary)] lg:mt-3">{heroCopy.title}</p>
                <p className="mt-1 hidden break-words text-xs font-semibold leading-5 text-[var(--muted)] sm:block lg:mx-auto lg:mt-2 lg:max-w-[15rem]">{heroCopy.description}</p>
              </div>
            </div>
            <div className="grid min-w-0 gap-2 lg:gap-3">
              {steps.map((step, index) => {
                const done = currentStep > index;
                const active = currentStep === index;
                return (
                  <div
                    className={cn(
                      "flex min-h-[56px] min-w-0 items-center gap-3 rounded-2xl border p-2.5 text-left transition sm:min-h-[64px] sm:p-3 lg:min-h-[76px]",
                      done && "border-[var(--primary)]/20 bg-[var(--surface)] text-[var(--text)] lg:border-[var(--primary)] lg:bg-[var(--primary)] lg:text-[var(--color-on-primary)]",
                      active && "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--primary-dark)] ring-2 ring-[var(--accent-ring)]",
                      !done && !active && "border-transparent bg-[var(--color-surface)] text-[var(--muted)]",
                    )}
                    key={step.label}
                  >
                    <span
                      className={cn(
                        "grid h-9 w-9 shrink-0 place-items-center rounded-xl sm:h-10 sm:w-10 lg:h-11 lg:w-11 lg:rounded-2xl",
                        done && "bg-[var(--primary)] lg:bg-[var(--color-on-primary-soft)]",
                        active && "bg-[var(--surface)]",
                        !done && !active && "bg-[var(--surface)]",
                      )}
                    >
                      <step.icon className={cn("h-6 w-6", done ? "text-[var(--color-on-primary)]" : active ? "text-[var(--primary)]" : "text-[var(--color-placeholder)]")} />
                    </span>
                    <span className="min-w-0 lg:flex-1">
                      <p className={cn("text-sm font-black leading-tight", done && "text-[var(--text)] lg:text-[var(--color-on-primary)]")}>{step.label}</p>
                      <p className={cn("mt-0.5 text-xs font-semibold leading-5 sm:mt-1", done ? "text-[var(--muted)] lg:text-[var(--color-on-primary-muted)]" : "text-[var(--muted)]")}>
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

      {order.orderType === "delivery" && order.deliveryDispatch ? (
        <Card className={cn("mt-4", order.deliveryDispatch.status === "delivered" && "p-4")}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--primary)]">Repartidor asignado</p>
              <h3 className="mt-1 text-lg font-black text-[var(--text)]">{order.deliveryDispatch.deliveryName || "Repartidor"}</h3>
              <p className="mt-1 text-sm font-semibold text-[var(--muted)]">
                {order.deliveryDispatch.status === "arrived"
                  ? "Ya marco llegada."
                  : order.deliveryDispatch.status === "delivered"
                    ? "Entrega completada por el repartidor."
                    : "Tiene el pedido para entrega."}
                {deliveryElapsed ? ` Tiempo desde despacho: ${deliveryElapsed}.` : ""}
              </p>
            </div>
            {deliveryPhoneDigits && order.deliveryDispatch.status !== "delivered" ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <a className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-black text-[var(--text)]" href={`tel:${deliveryPhoneDigits}`}>
                  <Phone className="h-4 w-4 text-[var(--primary)]" />
                  Llamar
                </a>
                <a className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[var(--color-success-soft)] px-4 text-sm font-black text-[var(--color-success-strong)]" href={deliveryWhatsappUrl} rel="noreferrer" target="_blank">
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </a>
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      <VirtualQueueCard businessType={businessType} order={order} queue={queue} />
    </>
  );
}
