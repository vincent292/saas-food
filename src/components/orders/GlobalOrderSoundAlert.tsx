"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { NewOrderSoundAlert } from "@/components/orders/NewOrderSoundAlert";
import { createClient } from "@/lib/supabase/client";
import type { Order } from "@/types/order.types";

type RealtimeOrderRow = {
  id?: string;
  restaurant_id?: string;
  order_number?: string | null;
  order_type?: Order["orderType"] | null;
  status?: Order["status"] | null;
  created_at?: string | null;
};

function realtimeOrder(row: RealtimeOrderRow): Order | null {
  if (!row.id || !row.restaurant_id || !row.order_type || !row.status) {
    return null;
  }

  return {
    acceptedAt: undefined,
    cancellationReason: undefined,
    cancelledAt: undefined,
    createdAt: row.created_at ?? new Date().toISOString(),
    customerAddress: "",
    customerEmail: "",
    customerName: "",
    customerPhone: "",
    deliveredAt: undefined,
    deliveryAddressDetail: undefined,
    deliveryDispatch: undefined,
    deliveryDistanceKm: undefined,
    deliveryFee: 0,
    deliveryLatitude: undefined,
    deliveryLongitude: undefined,
    deliveryMapsUrl: undefined,
    discountTotal: 0,
    id: row.id,
    items: [],
    notes: "",
    orderNumber: row.order_number ?? "Nuevo",
    orderOrigin: "web_checkout",
    orderType: row.order_type,
    paymentMethod: "cash",
    paymentReceiptReference: undefined,
    paymentReceiptUploadedAt: undefined,
    paymentReceiptUrl: undefined,
    paymentStatus: "pending",
    paymentVerifiedAt: undefined,
    preparingAt: undefined,
    printedAt: undefined,
    readyAt: undefined,
    requestedFulfillmentAt: undefined,
    requiresPrepayment: false,
    restaurantId: row.restaurant_id,
    status: row.status,
    subtotal: 0,
    tableId: "",
    total: 0,
  };
}

export function GlobalOrderSoundAlert({ restaurantId, orders }: { restaurantId: string; orders: Order[] }) {
  const router = useRouter();
  const refreshTimeoutRef = useRef<number | null>(null);
  const [liveOrders, setLiveOrders] = useState<Order[]>([]);

  const alertOrders = useMemo(() => {
    const byId = new Map<string, Order>();
    for (const order of orders) {
      byId.set(order.id, order);
    }
    for (const order of liveOrders.filter((order) => order.restaurantId === restaurantId)) {
      if (order.status === "pending") {
        byId.set(order.id, order);
      } else {
        byId.delete(order.id);
      }
    }
    return Array.from(byId.values());
  }, [liveOrders, orders, restaurantId]);

  useEffect(() => {
    const refresh = () => {
      if (refreshTimeoutRef.current) {
        window.clearTimeout(refreshTimeoutRef.current);
      }

      refreshTimeoutRef.current = window.setTimeout(() => {
        router.refresh();
        refreshTimeoutRef.current = null;
      }, 250);
    };

    const supabase = createClient();
    const channel = supabase
      .channel(`admin-global-orders-${restaurantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` }, (payload) => {
        const nextOrder = realtimeOrder((payload.new ?? payload.old ?? {}) as RealtimeOrderRow);
        if (nextOrder) {
          setLiveOrders((current) => {
            const withoutCurrent = current.filter((order) => order.id !== nextOrder.id);
            return nextOrder.status === "pending" ? [...withoutCurrent, nextOrder] : withoutCurrent;
          });
        }
        refresh();
      })
      .subscribe();

    const refreshOnFocus = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };

    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnFocus);

    return () => {
      if (refreshTimeoutRef.current) {
        window.clearTimeout(refreshTimeoutRef.current);
      }
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnFocus);
      supabase.removeChannel(channel);
    };
  }, [restaurantId, router]);

  return (
    <NewOrderSoundAlert
      actionLabel="Ir a aprobar"
      className="fixed inset-x-3 top-20 z-[88] shadow-2xl sm:bottom-auto sm:left-auto sm:right-6 sm:top-24 sm:max-w-xl"
      description="Hay un pedido nuevo esperando aprobacion. Entra a Pedidos para revisarlo y cobrarlo si corresponde."
      onOpenAlerts={() => router.push(`/admin/restaurantes/${restaurantId}/pedidos?tab=nuevos`)}
      orders={alertOrders}
      restaurantId={restaurantId}
      title="Pedido nuevo"
      watchOrderTypes={["table", "delivery", "pickup"]}
    />
  );
}
