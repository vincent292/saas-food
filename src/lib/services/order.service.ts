import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import type { Order, OrderDeliveryDispatch, OrderItem, OrderQueueState, OrderStatus, OrderTrackingStatus } from "@/types/order.types";

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
  delivery_latitude?: number | null;
  delivery_longitude?: number | null;
  delivery_maps_url?: string | null;
  requested_fulfillment_at?: string | null;
  invoice_required?: boolean | null;
  invoice_document_type?: string | null;
  invoice_document_number?: string | null;
  invoice_name?: string | null;
  invoice_issued_at?: string | null;
  invoice_issued_by?: string | null;
  invoice_number?: string | null;
  invoice_notes?: string | null;
  order_type: Order["orderType"];
  order_origin?: Order["orderOrigin"] | null;
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
  created_at?: string | null;
  opened_at: string | null;
  arrived_at: string | null;
  delivered_at: string | null;
};

type PublicOrderPayload = OrderRow & {
  items?: ItemRow[];
  delivery_dispatch_status?: OrderDeliveryDispatch["status"] | null;
  delivery_dispatch_phone?: string | null;
  delivery_dispatch_name?: string | null;
  delivery_dispatched_at?: string | null;
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

type OrderTrackingStatusRow = {
  id: string;
  restaurant_id: string;
  order_type: Order["orderType"];
  status: OrderStatus;
  accepted_at: string | null;
  preparing_at: string | null;
  ready_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  updated_at: string;
};

type DeliveryTrackingStatusRow = {
  status: OrderDeliveryDispatch["status"];
  delivery_phone?: string | null;
  delivery_name?: string | null;
  created_at?: string | null;
  opened_at: string | null;
  arrived_at: string | null;
  delivered_at: string | null;
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
    dispatchedAt: row.created_at ?? undefined,
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
    dispatchedAt: payload.delivery_dispatched_at ?? undefined,
    openedAt: payload.delivery_opened_at ?? undefined,
    arrivedAt: payload.delivery_arrived_at ?? undefined,
    deliveredAt: payload.delivery_delivered_at ?? undefined,
  };
}

function mapOrder(row: OrderRow, items: OrderItem[], deliveryDispatch?: OrderDeliveryDispatch): Order {
  const orderOrigin = row.order_origin ?? (row.order_type === "table" ? "table_qr" : row.order_type === "pos" ? "pos_counter" : "web_checkout");

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
    deliveryLatitude: row.delivery_latitude === null || row.delivery_latitude === undefined ? undefined : Number(row.delivery_latitude),
    deliveryLongitude: row.delivery_longitude === null || row.delivery_longitude === undefined ? undefined : Number(row.delivery_longitude),
    deliveryMapsUrl: row.delivery_maps_url ?? undefined,
    requestedFulfillmentAt: row.requested_fulfillment_at ?? undefined,
    invoiceRequired: row.invoice_required ?? false,
    invoiceDocumentType: row.invoice_document_type ?? undefined,
    invoiceDocumentNumber: row.invoice_document_number ?? undefined,
    invoiceName: row.invoice_name ?? undefined,
    invoiceIssuedAt: row.invoice_issued_at ?? undefined,
    invoiceIssuedBy: row.invoice_issued_by ?? undefined,
    invoiceNumber: row.invoice_number ?? undefined,
    invoiceNotes: row.invoice_notes ?? undefined,
    orderType: row.order_type,
    orderOrigin,
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

function mapTrackingStatus(row: OrderTrackingStatusRow, deliveryDispatch?: DeliveryTrackingStatusRow | null): OrderTrackingStatus {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    orderType: row.order_type,
    status: row.status,
    acceptedAt: row.accepted_at ?? undefined,
    preparingAt: row.preparing_at ?? undefined,
    readyAt: row.ready_at ?? undefined,
    deliveredAt: row.delivered_at ?? undefined,
    cancelledAt: row.cancelled_at ?? undefined,
    cancellationReason: row.cancellation_reason ?? undefined,
    updatedAt: deliveryDispatch?.updated_at && deliveryDispatch.updated_at > row.updated_at ? deliveryDispatch.updated_at : row.updated_at,
    deliveryDispatch: deliveryDispatch?.status
      ? {
          status: deliveryDispatch.status,
          deliveryPhone: deliveryDispatch.delivery_phone ?? undefined,
          deliveryName: deliveryDispatch.delivery_name ?? undefined,
          dispatchedAt: deliveryDispatch.created_at ?? undefined,
          openedAt: deliveryDispatch.opened_at ?? undefined,
          arrivedAt: deliveryDispatch.arrived_at ?? undefined,
          deliveredAt: deliveryDispatch.delivered_at ?? undefined,
        }
      : undefined,
  };
}

function mapOrderToTrackingStatus(order: Order): OrderTrackingStatus {
  return {
    id: order.id,
    restaurantId: order.restaurantId,
    orderType: order.orderType,
    status: order.status,
    acceptedAt: order.acceptedAt,
    preparingAt: order.preparingAt,
    readyAt: order.readyAt,
    deliveredAt: order.deliveredAt,
    cancelledAt: order.cancelledAt,
    cancellationReason: order.cancellationReason,
    updatedAt: order.deliveryDispatch?.deliveredAt ?? order.deliveredAt ?? order.cancelledAt ?? order.readyAt ?? order.preparingAt ?? order.acceptedAt ?? order.createdAt,
    deliveryDispatch: order.deliveryDispatch
      ? {
          status: order.deliveryDispatch.status,
          deliveryPhone: order.deliveryDispatch.deliveryPhone,
          deliveryName: order.deliveryDispatch.deliveryName,
          dispatchedAt: order.deliveryDispatch.dispatchedAt,
          openedAt: order.deliveryDispatch.openedAt,
          arrivedAt: order.deliveryDispatch.arrivedAt,
          deliveredAt: order.deliveryDispatch.deliveredAt,
        }
      : undefined,
  };
}

function startOfBusinessDayIso() {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/La_Paz",
    year: "numeric",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";

  return new Date(`${year}-${month}-${day}T00:00:00-04:00`).toISOString();
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

  async listCashWorkspaceOrders(restaurantId: string) {
    if (!hasSupabaseEnv()) {
      return [];
    }

    const supabase = await createClient();
    const { data: orders, error } = await supabase
      .from("orders")
      .select(
        "id,restaurant_id,table_id,order_number,customer_name,customer_phone,customer_email,customer_address,delivery_address_detail,delivery_latitude,delivery_longitude,delivery_maps_url,requested_fulfillment_at,order_type,order_origin,status,payment_status,payment_method,payment_receipt_url,payment_receipt_uploaded_at,payment_receipt_reference,payment_verified_at,subtotal,delivery_fee,discount_total,total,notes,created_at,accepted_at,preparing_at,ready_at,delivered_at,cancelled_at,cancellation_reason,printed_at",
      )
      .eq("restaurant_id", restaurantId)
      .gte("created_at", startOfBusinessDayIso())
      .in("status", ["pending", "accepted", "preparing", "ready", "delivered"])
      .order("created_at", { ascending: false })
      .limit(160);

    if (error || !orders?.length) {
      return [];
    }

    const orderIds = orders.map((order) => order.id);
    const [{ data: items }, { data: deliveryLinks }] = await Promise.all([
      supabase.from("order_items").select("id,order_id,product_id,product_name,unit_price,quantity,subtotal,notes").in("order_id", orderIds),
      supabase.from("order_delivery_links").select("order_id,delivery_phone,delivery_name,status,created_at,opened_at,arrived_at,delivered_at").in("order_id", orderIds),
    ]);

    return orders.map((order) =>
      mapOrder(
        order as OrderRow,
        (items ?? []).filter((item) => item.order_id === order.id).map(mapItem),
        mapDeliveryLink((deliveryLinks ?? []).find((link) => link.order_id === order.id) as DeliveryLinkRow | undefined),
      ),
    );
  },

  async listPendingAlerts(restaurantId: string) {
    if (!hasSupabaseEnv()) {
      return [];
    }

    const supabase = await createClient();
    const { data: orders, error } = await supabase
      .from("orders")
      .select(
        "id,restaurant_id,table_id,order_number,customer_name,customer_phone,customer_email,customer_address,delivery_address_detail,delivery_latitude,delivery_longitude,delivery_maps_url,requested_fulfillment_at,order_type,order_origin,status,payment_status,payment_method,payment_receipt_url,payment_receipt_uploaded_at,payment_receipt_reference,payment_verified_at,subtotal,delivery_fee,discount_total,total,notes,created_at,accepted_at,preparing_at,ready_at,delivered_at,cancelled_at,cancellation_reason,printed_at",
      )
      .eq("restaurant_id", restaurantId)
      .gte("created_at", startOfBusinessDayIso())
      .eq("status", "pending")
      .in("order_type", ["table", "delivery", "pickup"])
      .order("created_at", { ascending: false })
      .limit(30);

    if (error || !orders?.length) {
      return [];
    }

    return orders.map((order) => mapOrder(order as OrderRow, []));
  },

  async listInvoiceRequests(restaurantId: string) {
    if (!hasSupabaseEnv()) {
      return [];
    }

    const supabase = await createClient();
    const { data: orders, error } = await supabase
      .from("orders")
      .select(
        "id,restaurant_id,table_id,order_number,customer_name,customer_phone,customer_email,customer_address,delivery_address_detail,delivery_latitude,delivery_longitude,delivery_maps_url,requested_fulfillment_at,invoice_required,invoice_document_type,invoice_document_number,invoice_name,invoice_issued_at,invoice_issued_by,invoice_number,invoice_notes,order_type,order_origin,status,payment_status,payment_method,payment_receipt_url,payment_receipt_uploaded_at,payment_receipt_reference,payment_verified_at,subtotal,delivery_fee,discount_total,total,notes,created_at,accepted_at,preparing_at,ready_at,delivered_at,cancelled_at,cancellation_reason,printed_at",
      )
      .eq("restaurant_id", restaurantId)
      .eq("invoice_required", true)
      .neq("status", "cancelled")
      .order("invoice_issued_at", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: false })
      .limit(100);

    if (error || !orders?.length) {
      return [];
    }

    return orders.map((order) => mapOrder(order as OrderRow, []));
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

  async getStatusById(restaurantId: string, orderId: string) {
    if (!hasSupabaseEnv()) {
      return null;
    }

    const supabase = await createClient();
    const { data: order, error } = await supabase
      .from("orders")
      .select("id,restaurant_id,order_type,status,accepted_at,preparing_at,ready_at,delivered_at,cancelled_at,cancellation_reason,updated_at")
      .eq("restaurant_id", restaurantId)
      .eq("id", orderId)
      .maybeSingle();

    if (error || !order) {
      return null;
    }

    const { data: deliveryLink } = await supabase
      .from("order_delivery_links")
      .select("status,delivery_phone,delivery_name,created_at,opened_at,arrived_at,delivered_at,updated_at")
      .eq("order_id", order.id)
      .maybeSingle();

    return mapTrackingStatus(order as OrderTrackingStatusRow, deliveryLink as DeliveryTrackingStatusRow | null);
  },

  async getPublicStatusByTracking(restaurantId: string, orderId: string, token: string) {
    if (!hasSupabaseEnv() || !token) {
      return null;
    }

    const admin = createAdminClient();

    if (!admin) {
      const order = await this.getPublicByTracking(restaurantId, orderId, token);
      return order ? mapOrderToTrackingStatus(order) : null;
    }

    const { data: order, error } = await admin
      .from("orders")
      .select("id,restaurant_id,order_type,status,accepted_at,preparing_at,ready_at,delivered_at,cancelled_at,cancellation_reason,updated_at")
      .eq("restaurant_id", restaurantId)
      .eq("id", orderId)
      .eq("tracking_token", token)
      .maybeSingle();

    if (error || !order) {
      return null;
    }

    const { data: deliveryLink } = await admin
      .from("order_delivery_links")
      .select("status,delivery_phone,delivery_name,created_at,opened_at,arrived_at,delivered_at,updated_at")
      .eq("order_id", order.id)
      .maybeSingle();

    return mapTrackingStatus(order as OrderTrackingStatusRow, deliveryLink as DeliveryTrackingStatusRow | null);
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
