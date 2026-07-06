import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import type { Order, OrderDeliveryDispatch, OrderItem, OrderQueueState, OrderStatus } from "@/types/order.types";

type OrderRow = {
  id: string;
  restaurant_id: string;
  table_id: string | null;
  order_number: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email?: string | null;
  customer_address: string | null;
  delivery_address_detail?: string | null;
  delivery_maps_url?: string | null;
  requested_fulfillment_at?: string | null;
  order_type: Order["orderType"];
  status: Order["status"];
  payment_status: Order["paymentStatus"];
  payment_method: Order["paymentMethod"];
  payment_receipt_url: string | null;
  payment_receipt_uploaded_at: string | null;
  payment_receipt_reference: string | null;
  payment_verified_at: string | null;
  subtotal: number;
  delivery_fee: number;
  discount_total: number;
  total: number;
  notes: string | null;
  created_at: string;
  accepted_at: string | null;
  preparing_at: string | null;
  ready_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  printed_at: string | null;
};

type ItemRow = {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  unit_price: number;
  quantity: number;
  subtotal: number;
  notes: string | null;
};

type DeliveryLinkRow = {
  order_id: string;
  delivery_phone: string | null;
  delivery_name: string | null;
  status: OrderDeliveryDispatch["status"];
  opened_at: string | null;
  arrived_at: string | null;
  delivered_at: string | null;
};

type PublicOrderPayload = OrderRow & {
  items?: ItemRow[];
  delivery_dispatch_status?: OrderDeliveryDispatch["status"] | null;
  delivery_dispatch_phone?: string | null;
  delivery_dispatch_name?: string | null;
  delivery_opened_at?: string | null;
  delivery_arrived_at?: string | null;
  delivery_delivered_at?: string | null;
};

type PublicQueuePayload = {
  restaurant_id?: string;
  status?: OrderStatus;
  queue_enabled?: boolean;
  queue_position?: number | null;
  orders_ahead?: number | null;
  active_orders?: number;
  preparing_orders?: number;
  ready_orders?: number;
  recent_orders?: number;
  estimated_min_minutes?: number;
  estimated_max_minutes?: number;
  estimated_ready_at_min?: string | null;
  estimated_ready_at_max?: string | null;
  demand_label?: string;
  demand_level?: OrderQueueState["demandLevel"];
  confidence?: OrderQueueState["confidence"];
  kitchen_capacity?: number;
  base_prep_minutes?: number;
  history_sample_size?: number;
  updated_at?: string;
};

function mapItem(row: ItemRow): OrderItem {
  return {
    id: row.id,
    orderId: row.order_id,
    productId: row.product_id ?? "",
    productName: row.product_name,
    unitPrice: Number(row.unit_price),
    quantity: row.quantity,
    subtotal: Number(row.subtotal),
    notes: row.notes ?? undefined,
  };
}

function mapDeliveryLink(row?: DeliveryLinkRow | null): OrderDeliveryDispatch | undefined {
  if (!row?.status) {
    return undefined;
  }

  return {
    status: row.status,
    deliveryPhone: row.delivery_phone ?? undefined,
    deliveryName: row.delivery_name ?? undefined,
    openedAt: row.opened_at ?? undefined,
    arrivedAt: row.arrived_at ?? undefined,
    deliveredAt: row.delivered_at ?? undefined,
  };
}

function mapPublicDelivery(payload: PublicOrderPayload): OrderDeliveryDispatch | undefined {
  if (!payload.delivery_dispatch_status) {
    return undefined;
  }

  return {
    status: payload.delivery_dispatch_status,
    deliveryPhone: payload.delivery_dispatch_phone ?? undefined,
    deliveryName: payload.delivery_dispatch_name ?? undefined,
    openedAt: payload.delivery_opened_at ?? undefined,
    arrivedAt: payload.delivery_arrived_at ?? undefined,
    deliveredAt: payload.delivery_delivered_at ?? undefined,
  };
}

function mapOrder(row: OrderRow, items: OrderItem[], deliveryDispatch?: OrderDeliveryDispatch): Order {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    tableId: row.table_id ?? undefined,
    orderNumber: row.order_number,
    customerName: row.customer_name ?? "",
    customerPhone: row.customer_phone ?? "",
    customerEmail: row.customer_email ?? undefined,
    customerAddress: row.customer_address ?? undefined,
    deliveryAddressDetail: row.delivery_address_detail ?? undefined,
    deliveryMapsUrl: row.delivery_maps_url ?? undefined,
    requestedFulfillmentAt: row.requested_fulfillment_at ?? undefined,
    orderType: row.order_type,
    status: row.status,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method,
    paymentReceiptUrl: row.payment_receipt_url ?? undefined,
    paymentReceiptUploadedAt: row.payment_receipt_uploaded_at ?? undefined,
    paymentReceiptReference: row.payment_receipt_reference ?? undefined,
    paymentVerifiedAt: row.payment_verified_at ?? undefined,
    subtotal: Number(row.subtotal),
    deliveryFee: Number(row.delivery_fee),
    discountTotal: Number(row.discount_total),
    total: Number(row.total),
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    acceptedAt: row.accepted_at ?? undefined,
    preparingAt: row.preparing_at ?? undefined,
    readyAt: row.ready_at ?? undefined,
    deliveredAt: row.delivered_at ?? undefined,
    cancelledAt: row.cancelled_at ?? undefined,
    cancellationReason: row.cancellation_reason ?? undefined,
    printedAt: row.printed_at ?? undefined,
    deliveryDispatch,
    items,
  };
}

function mapQueueState(payload: PublicQueuePayload): OrderQueueState | null {
  if (!payload.status) {
    return null;
  }

  return {
    queueEnabled: payload.queue_enabled ?? true,
    status: payload.status,
    queuePosition: payload.queue_position ?? undefined,
    ordersAhead: payload.orders_ahead ?? undefined,
    activeOrders: Number(payload.active_orders ?? 0),
    preparingOrders: Number(payload.preparing_orders ?? 0),
    readyOrders: Number(payload.ready_orders ?? 0),
    recentOrders: Number(payload.recent_orders ?? 0),
    estimatedMinMinutes: Number(payload.estimated_min_minutes ?? 0),
    estimatedMaxMinutes: Number(payload.estimated_max_minutes ?? 0),
    estimatedReadyAtMin: payload.estimated_ready_at_min ?? undefined,
    estimatedReadyAtMax: payload.estimated_ready_at_max ?? undefined,
    demandLabel: payload.demand_label ?? "Demanda normal",
    demandLevel: payload.demand_level ?? "normal",
    confidence: payload.confidence ?? "low",
    kitchenCapacity: Number(payload.kitchen_capacity ?? 1),
    basePrepMinutes: Number(payload.base_prep_minutes ?? 0),
    historySampleSize: Number(payload.history_sample_size ?? 0),
    updatedAt: payload.updated_at ?? new Date().toISOString(),
  };
}

export const orderService = {
  async listByRestaurant(restaurantId: string) {
    if (!hasSupabaseEnv()) {
      return [];
    }

    const supabase = await createClient();
    const { data: orders, error } = await supabase
      .from("orders")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false });

    if (error || !orders?.length) {
      return [];
    }

    const orderIds = orders.map((order) => order.id);
    const { data: items } = await supabase.from("order_items").select("*").in("order_id", orderIds);

    const { data: deliveryLinks } = await supabase.from("order_delivery_links").select("*").in("order_id", orderIds);

    return orders.map((order) =>
      mapOrder(
        order,
        (items ?? []).filter((item) => item.order_id === order.id).map(mapItem),
        mapDeliveryLink((deliveryLinks ?? []).find((link) => link.order_id === order.id) as DeliveryLinkRow | undefined),
      ),
    );
  },

  async listLiveByRestaurant(restaurantId: string) {
    return (await this.listByRestaurant(restaurantId)).filter((order) => order.status !== "delivered" && order.status !== "cancelled");
  },

  async listByStatus(restaurantId: string, status: OrderStatus) {
    return (await this.listByRestaurant(restaurantId)).filter((order) => order.status === status);
  },

  async getById(restaurantId: string, orderId: string) {
    if (!hasSupabaseEnv()) {
      return null;
    }

    const supabase = await createClient();
    const { data: order, error } = await supabase.from("orders").select("*").eq("restaurant_id", restaurantId).eq("id", orderId).maybeSingle();

    if (error || !order) {
      return null;
    }

    const { data: items } = await supabase.from("order_items").select("*").eq("order_id", order.id);
    const { data: deliveryLink } = await supabase.from("order_delivery_links").select("*").eq("order_id", order.id).maybeSingle();
    return mapOrder(order, (items ?? []).map(mapItem), mapDeliveryLink(deliveryLink as DeliveryLinkRow | null));
  },

  async getPublicByTracking(restaurantId: string, orderId: string, token: string) {
    if (!hasSupabaseEnv() || !token) {
      return null;
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_public_order", {
      p_order_id: orderId,
      p_tracking_token: token,
    });

    if (error || !data) {
      return null;
    }

    const payload = data as unknown as PublicOrderPayload;
    if (payload.restaurant_id !== restaurantId) {
      return null;
    }

    return mapOrder(payload, (payload.items ?? []).map(mapItem), mapPublicDelivery(payload));
  },

  async getPublicQueueState(restaurantId: string, orderId: string, token: string) {
    if (!hasSupabaseEnv() || !token) {
      return null;
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_public_order_queue_state", {
      p_order_id: orderId,
      p_tracking_token: token,
    });

    if (error || !data) {
      return null;
    }

    const payload = data as PublicQueuePayload;
    if (payload.restaurant_id !== restaurantId) {
      return null;
    }

    return mapQueueState(payload);
  },
};
