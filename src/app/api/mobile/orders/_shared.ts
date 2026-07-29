import { orderService } from "@/lib/services/order.service";
import type { Order, OrderQueueState } from "@/types/order.types";
import type { SupabaseClient } from "@supabase/supabase-js";

type RestaurantRow = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  logo_url: string | null;
  business_type: string | null;
  whatsapp: string | null;
};

function serializeOrder(order: Order, trackingToken: string) {
  return {
    id: order.id,
    restaurantId: order.restaurantId,
    orderNumber: order.orderNumber,
    trackingToken,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    customerAddress: order.customerAddress,
    deliveryAddressDetail: order.deliveryAddressDetail,
    deliveryLatitude: order.deliveryLatitude,
    deliveryLongitude: order.deliveryLongitude,
    deliveryMapsUrl: order.deliveryMapsUrl,
    deliveryDistanceKm: order.deliveryDistanceKm,
    orderType: order.orderType,
    orderOrigin: order.orderOrigin,
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    subtotal: order.subtotal,
    deliveryFee: order.deliveryFee,
    discountTotal: order.discountTotal,
    total: order.total,
    notes: order.notes,
    createdAt: order.createdAt,
    acceptedAt: order.acceptedAt,
    preparingAt: order.preparingAt,
    readyAt: order.readyAt,
    deliveredAt: order.deliveredAt,
    cancelledAt: order.cancelledAt,
    cancellationReason: order.cancellationReason,
    deliveryDispatch: order.deliveryDispatch,
    items: order.items.map((item) => ({
      id: item.id,
      orderId: item.orderId,
      productId: item.productId,
      productName: item.productName,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      subtotal: item.subtotal,
      notes: item.notes,
    })),
  };
}

function serializeQueue(queue: OrderQueueState | null) {
  if (!queue) return null;

  return {
    queueEnabled: queue.queueEnabled,
    status: queue.status,
    queuePosition: queue.queuePosition,
    ordersAhead: queue.ordersAhead,
    activeOrders: queue.activeOrders,
    preparingOrders: queue.preparingOrders,
    readyOrders: queue.readyOrders,
    recentOrders: queue.recentOrders,
    estimatedMinMinutes: queue.estimatedMinMinutes,
    estimatedMaxMinutes: queue.estimatedMaxMinutes,
    estimatedReadyAtMin: queue.estimatedReadyAtMin,
    estimatedReadyAtMax: queue.estimatedReadyAtMax,
    demandLabel: queue.demandLabel,
    demandLevel: queue.demandLevel,
    confidence: queue.confidence,
    kitchenCapacity: queue.kitchenCapacity,
    basePrepMinutes: queue.basePrepMinutes,
    historySampleSize: queue.historySampleSize,
    updatedAt: queue.updatedAt,
  };
}

export async function buildMobileOrderTrackingPayload({
  orderId,
  restaurantId,
  supabase,
  trackingToken,
}: {
  orderId: string;
  restaurantId: string;
  supabase: SupabaseClient;
  trackingToken: string;
}) {
  const [{ data: restaurant }, order, queue] = await Promise.all([
    supabase
      .from("restaurants")
      .select("id,name,slug,city,logo_url,business_type,whatsapp")
      .eq("id", restaurantId)
      .eq("status", "active")
      .is("deleted_at", null)
      .maybeSingle(),
    orderService.getPublicByTracking(restaurantId, orderId, trackingToken),
    orderService.getPublicQueueState(restaurantId, orderId, trackingToken),
  ]);

  if (!restaurant || !order) {
    return null;
  }

  const restaurantRow = restaurant as RestaurantRow;

  return {
    restaurant: {
      id: restaurantRow.id,
      name: restaurantRow.name,
      slug: restaurantRow.slug,
      city: restaurantRow.city ?? "",
      logoUrl: restaurantRow.logo_url ?? "",
      businessType: restaurantRow.business_type ?? "food",
      whatsapp: restaurantRow.whatsapp ?? "",
    },
    order: serializeOrder(order, trackingToken),
    queue: serializeQueue(queue),
    updatedAt: new Date().toISOString(),
  };
}
