"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { updateOperationalOrderStatusAction } from "@/app/admin/actions";
import {
  useRestaurantRealtimeRefresh,
  type RealtimeScope,
  type RestaurantRealtimeChange,
} from "@/lib/client/use-restaurant-realtime-refresh";
import type { Order, OrderStatus } from "@/types/order.types";

type OperationalOrderStatus = "preparing" | "ready" | "delivered";

type PendingStatusChange = {
  changedAt: string;
  previousOrder: Order;
  status: OperationalOrderStatus;
};

function patchOrderStatus(order: Order, status: OrderStatus, changedAt?: string) {
  const nextOrder = { ...order, status };
  if (!changedAt) return nextOrder;
  if (status === "preparing") nextOrder.preparingAt = changedAt;
  if (status === "ready") nextOrder.readyAt = changedAt;
  if (status === "delivered") nextOrder.deliveredAt = changedAt;
  if (status === "cancelled") nextOrder.cancelledAt = changedAt;
  return nextOrder;
}

function patchOrderFromRealtime(order: Order, record: Record<string, unknown>) {
  const status = typeof record.status === "string" ? (record.status as OrderStatus) : order.status;
  return {
    ...order,
    status,
    paymentStatus: typeof record.payment_status === "string" ? (record.payment_status as Order["paymentStatus"]) : order.paymentStatus,
    paymentReceiptUrl: typeof record.payment_receipt_url === "string" ? record.payment_receipt_url : order.paymentReceiptUrl,
    paymentReceiptReference: typeof record.payment_receipt_reference === "string" ? record.payment_receipt_reference : order.paymentReceiptReference,
    acceptedAt: typeof record.accepted_at === "string" ? record.accepted_at : order.acceptedAt,
    preparingAt: typeof record.preparing_at === "string" ? record.preparing_at : order.preparingAt,
    readyAt: typeof record.ready_at === "string" ? record.ready_at : order.readyAt,
    deliveredAt: typeof record.delivered_at === "string" ? record.delivered_at : order.deliveredAt,
    cancelledAt: typeof record.cancelled_at === "string" ? record.cancelled_at : order.cancelledAt,
    cancellationReason: typeof record.cancellation_reason === "string" ? record.cancellation_reason : order.cancellationReason,
  };
}

function statusErrorMessage(error: string) {
  if (error === "invalid-order-transition") return "Otro usuario ya cambio este pedido. La pantalla se actualizara con el estado correcto.";
  if (error === "order-not-found") return "No encontramos el pedido. Actualiza la pantalla e intenta nuevamente.";
  if (error === "invalid-order-status") return "Ese cambio de estado no esta permitido.";
  return "No se pudo guardar el cambio. El pedido volvio a su estado anterior.";
}

export function useLiveOrders({
  enabled = true,
  initialOrders,
  restaurantId,
  restaurantSlug,
  scope,
}: {
  enabled?: boolean;
  initialOrders: Order[];
  restaurantId: string;
  restaurantSlug: string;
  scope: RealtimeScope;
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [pendingOrderIds, setPendingOrderIds] = useState<Set<string>>(() => new Set());
  const [statusError, setStatusError] = useState("");
  const ordersRef = useRef(initialOrders);
  const pendingChangesRef = useRef(new Map<string, PendingStatusChange>());

  const commitOrders = useCallback((updater: (current: Order[]) => Order[]) => {
    setOrders((current) => {
      const next = updater(current);
      ordersRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    for (const incomingOrder of initialOrders) {
      const pendingChange = pendingChangesRef.current.get(incomingOrder.id);
      if (pendingChange?.status === incomingOrder.status) {
        pendingChangesRef.current.delete(incomingOrder.id);
      }
    }

    const nextOrders = initialOrders.map((incomingOrder) => {
      const pendingChange = pendingChangesRef.current.get(incomingOrder.id);
      return pendingChange
        ? patchOrderStatus(incomingOrder, pendingChange.status, pendingChange.changedAt)
        : incomingOrder;
    });
    ordersRef.current = nextOrders;
    setOrders(nextOrders);
    setPendingOrderIds(new Set(pendingChangesRef.current.keys()));
  }, [initialOrders]);

  const handleRealtimeChange = useCallback((change: RestaurantRealtimeChange) => {
    if (change.table !== "orders") return;
    const record = change.eventType === "DELETE" ? change.oldRecord : change.newRecord;
    const orderId = typeof record.id === "string" ? record.id : "";
    if (!orderId) return;

    if (change.eventType === "DELETE") {
      pendingChangesRef.current.delete(orderId);
      setPendingOrderIds(new Set(pendingChangesRef.current.keys()));
      commitOrders((current) => current.filter((order) => order.id !== orderId));
      return;
    }

    const incomingStatus = typeof record.status === "string" ? (record.status as OrderStatus) : undefined;
    const pendingChange = pendingChangesRef.current.get(orderId);
    if (pendingChange && incomingStatus && incomingStatus !== pendingChange.previousOrder.status) {
      pendingChangesRef.current.delete(orderId);
      setPendingOrderIds(new Set(pendingChangesRef.current.keys()));
    }

    commitOrders((current) =>
      current.map((order) => (order.id === orderId ? patchOrderFromRealtime(order, record) : order)),
    );
  }, [commitOrders]);

  useRestaurantRealtimeRefresh({
    enabled,
    onChange: handleRealtimeChange,
    restaurantId,
    scope,
  });

  const updateStatus = useCallback(async (orderId: string, status: OperationalOrderStatus) => {
    const previousOrder = ordersRef.current.find((order) => order.id === orderId);
    if (!previousOrder || pendingChangesRef.current.has(orderId)) return false;
    if (previousOrder.status !== "accepted" && previousOrder.status !== "preparing" && previousOrder.status !== "ready") {
      setStatusError("Ese pedido ya cambio de estado.");
      return false;
    }

    const changedAt = new Date().toISOString();
    pendingChangesRef.current.set(orderId, { changedAt, previousOrder, status });
    setPendingOrderIds(new Set(pendingChangesRef.current.keys()));
    setStatusError("");
    commitOrders((current) =>
      current.map((order) => (order.id === orderId ? patchOrderStatus(order, status, changedAt) : order)),
    );

    try {
      const result = await updateOperationalOrderStatusAction({
        expectedStatus: previousOrder.status,
        orderId,
        restaurantId,
        restaurantSlug,
        status,
      });

      if (!result.ok) {
        throw new Error(result.error);
      }

      pendingChangesRef.current.delete(orderId);
      setPendingOrderIds(new Set(pendingChangesRef.current.keys()));
      commitOrders((current) =>
        current.map((order) =>
          order.id === orderId && (order.status === previousOrder.status || order.status === result.status)
            ? patchOrderStatus(order, result.status, result.changedAt)
            : order,
        ),
      );
      return true;
    } catch (error) {
      const pendingChange = pendingChangesRef.current.get(orderId);
      pendingChangesRef.current.delete(orderId);
      setPendingOrderIds(new Set(pendingChangesRef.current.keys()));
      if (pendingChange) {
        commitOrders((current) =>
          current.map((order) => (order.id === orderId ? pendingChange.previousOrder : order)),
        );
      }
      setStatusError(statusErrorMessage(error instanceof Error ? error.message : "order-status-update"));
      return false;
    }
  }, [commitOrders, restaurantId, restaurantSlug]);

  return {
    clearStatusError: () => setStatusError(""),
    orders,
    pendingOrderIds,
    statusError,
    updateStatus,
  };
}
