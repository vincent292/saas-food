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
  order_origin?: Order["orderOrigin"] | null;
  status?: Order["status"] | null;
  payment_method?: Order["paymentMethod"] | null;
  payment_status?: Order["paymentStatus"] | null;
  total?: number | string | null;
  created_at?: string | null;
};

const PENDING_ALERT_COLUMNS = "id,restaurant_id,order_number,order_type,order_origin,status,payment_method,payment_status,total,created_at";

function startOfBusinessDayIso() {
  const now = new Date();
  const date = new Date(now);
  date.setHours(4, 0, 0, 0);
  if (now < date) {
    date.setDate(date.getDate() - 1);
  }
  return date.toISOString();
}

function fallbackOrderOrigin(row: RealtimeOrderRow): Order["orderOrigin"] {
  if (row.order_origin) {
    return row.order_origin;
  }

  if (row.order_type === "table") {
    return "table_qr";
  }

  if (row.order_type === "pos") {
    return "pos_counter";
  }

  return "web_checkout";
}

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
    orderOrigin: fallbackOrderOrigin(row),
    orderType: row.order_type,
    paymentMethod: row.payment_method ?? "cash",
    paymentReceiptReference: undefined,
    paymentReceiptUploadedAt: undefined,
    paymentReceiptUrl: undefined,
    paymentStatus: row.payment_status ?? "pending",
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
    total: Number(row.total ?? 0),
  };
}

export function GlobalOrderSoundAlert({ restaurantId, orders }: { restaurantId: string; orders: Order[] }) {
  const router = useRouter();
  const realtimeConnectedRef = useRef(false);
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
    let cancelled = false;

    const supabase = createClient();
    const mergePendingOrders = (pendingOrders: Order[]) => {
      if (!pendingOrders.length) {
        return;
      }

      setLiveOrders((current) => {
        const byId = new Map(current.map((order) => [order.id, order]));
        for (const order of pendingOrders) {
          byId.set(order.id, order);
        }
        return Array.from(byId.values()).slice(-60);
      });
    };

    const loadPendingOrders = async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(PENDING_ALERT_COLUMNS)
        .eq("restaurant_id", restaurantId)
        .gte("created_at", startOfBusinessDayIso())
        .eq("status", "pending")
        .in("order_type", ["table", "delivery", "pickup"])
        .order("created_at", { ascending: false })
        .limit(30);

      if (cancelled || error) {
        return;
      }

      const pendingOrders = ((data ?? []) as RealtimeOrderRow[]).map(realtimeOrder).filter((order): order is Order => Boolean(order));
      mergePendingOrders(pendingOrders);

    };

    const channel = supabase
      .channel(`admin-global-orders-${restaurantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` }, (payload) => {
        const nextOrder = realtimeOrder((payload.new ?? payload.old ?? {}) as RealtimeOrderRow);
        if (nextOrder) {
          setLiveOrders((current) => {
            const withoutCurrent = current.filter((order) => order.id !== nextOrder.id);
            return [...withoutCurrent, nextOrder].slice(-60);
          });
        }
      })
      .subscribe((status) => {
        realtimeConnectedRef.current = status === "SUBSCRIBED";
        if (status === "SUBSCRIBED") {
          void loadPendingOrders();
        }
      });

    const fallbackInterval = window.setInterval(() => {
      if (!realtimeConnectedRef.current) {
        void loadPendingOrders();
      }
    }, 60_000);

    const refreshOnFocus = () => {
      if (document.visibilityState === "visible") {
        void loadPendingOrders();
      }
    };

    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnFocus);

    return () => {
      cancelled = true;
      realtimeConnectedRef.current = false;
      window.clearInterval(fallbackInterval);
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnFocus);
      void supabase.removeChannel(channel);
    };
  }, [restaurantId]);

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
