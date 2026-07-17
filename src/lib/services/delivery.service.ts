import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import type { DeliveryOrder, DeliveryOrderItem } from "@/types/delivery.types";

type DeliveryOrderPayload = {
  link_id?: string;
  delivery_token?: string;
  delivery_phone?: string | null;
  delivery_name?: string | null;
  link_status?: DeliveryOrder["linkStatus"];
  opened_at?: string | null;
  arrived_at?: string | null;
  link_delivered_at?: string | null;
  expires_at?: string;
  restaurant_id?: string;
  restaurant_name?: string;
  restaurant_slug?: string;
  restaurant_whatsapp?: string | null;
  order_id?: string;
  order_number?: string;
  order_status?: DeliveryOrder["orderStatus"];
  payment_status?: DeliveryOrder["paymentStatus"];
  payment_method?: DeliveryOrder["paymentMethod"];
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  delivery_address_detail?: string | null;
  delivery_latitude?: number | null;
  delivery_longitude?: number | null;
  delivery_maps_url?: string | null;
  requested_fulfillment_at?: string | null;
  notes?: string | null;
  total?: number;
  created_at?: string;
  ready_at?: string | null;
  delivered_at?: string | null;
  items?: Array<{
    id: string;
    product_name: string;
    unit_price?: number;
    quantity: number;
    subtotal?: number;
    notes: string | null;
  }>;
};

function mapItem(item: NonNullable<DeliveryOrderPayload["items"]>[number]): DeliveryOrderItem {
  return {
    id: item.id,
    productName: item.product_name,
    unitPrice: Number(item.unit_price ?? 0),
    quantity: Number(item.quantity),
    subtotal: Number(item.subtotal ?? 0),
    notes: item.notes ?? undefined,
  };
}

function mapDeliveryOrder(payload: DeliveryOrderPayload): DeliveryOrder | null {
  if (!payload.link_id || !payload.delivery_token || !payload.restaurant_id || !payload.order_id || !payload.order_status) {
    return null;
  }

  return {
    linkId: payload.link_id,
    deliveryToken: payload.delivery_token,
    deliveryPhone: payload.delivery_phone ?? undefined,
    deliveryName: payload.delivery_name ?? undefined,
    linkStatus: payload.link_status ?? "active",
    openedAt: payload.opened_at ?? undefined,
    arrivedAt: payload.arrived_at ?? undefined,
    linkDeliveredAt: payload.link_delivered_at ?? undefined,
    expiresAt: payload.expires_at ?? "",
    restaurantId: payload.restaurant_id,
    restaurantName: payload.restaurant_name ?? "Restaurante",
    restaurantSlug: payload.restaurant_slug ?? "",
    restaurantWhatsapp: payload.restaurant_whatsapp ?? undefined,
    orderId: payload.order_id,
    orderNumber: payload.order_number ?? "",
    orderStatus: payload.order_status,
    paymentStatus: payload.payment_status ?? "pending",
    paymentMethod: payload.payment_method ?? "cash",
    customerName: payload.customer_name ?? "Cliente",
    customerPhone: payload.customer_phone ?? "",
    customerAddress: payload.customer_address ?? "",
    deliveryAddressDetail: payload.delivery_address_detail ?? undefined,
    deliveryLatitude: payload.delivery_latitude === null || payload.delivery_latitude === undefined ? undefined : Number(payload.delivery_latitude),
    deliveryLongitude: payload.delivery_longitude === null || payload.delivery_longitude === undefined ? undefined : Number(payload.delivery_longitude),
    deliveryMapsUrl: payload.delivery_maps_url ?? undefined,
    requestedFulfillmentAt: payload.requested_fulfillment_at ?? undefined,
    notes: payload.notes ?? undefined,
    total: Number(payload.total ?? 0),
    createdAt: payload.created_at ?? "",
    readyAt: payload.ready_at ?? undefined,
    deliveredAt: payload.delivered_at ?? undefined,
    items: (payload.items ?? []).map(mapItem),
  };
}

export const deliveryService = {
  async getByToken(token: string) {
    if (!hasSupabaseEnv() || !token) {
      return null;
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_delivery_order", {
      p_delivery_token: token,
    });

    if (error || !data) {
      return null;
    }

    return mapDeliveryOrder(data as DeliveryOrderPayload);
  },
};
