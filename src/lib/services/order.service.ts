import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import type { Order, OrderItem, OrderStatus } from "@/types/order.types";

type OrderRow = {
  id: string;
  restaurant_id: string;
  table_id: string | null;
  order_number: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_address: string | null;
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

type PublicOrderPayload = OrderRow & {
  items?: ItemRow[];
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

function mapOrder(row: OrderRow, items: OrderItem[]): Order {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    tableId: row.table_id ?? undefined,
    orderNumber: row.order_number,
    customerName: row.customer_name ?? "",
    customerPhone: row.customer_phone ?? "",
    customerAddress: row.customer_address ?? undefined,
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
    items,
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

    return orders.map((order) => mapOrder(order, (items ?? []).filter((item) => item.order_id === order.id).map(mapItem)));
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
    return mapOrder(order, (items ?? []).map(mapItem));
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

    return mapOrder(payload, (payload.items ?? []).map(mapItem));
  },
};
