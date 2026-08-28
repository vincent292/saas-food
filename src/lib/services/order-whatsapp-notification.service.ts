import { createAdminClient } from "@/lib/supabase/admin";
import { getSiteUrl } from "@/lib/seo/site-url";
import type { Json } from "@/types/database.types";
import type { OrderStatus } from "@/types/order.types";

type OrderNotificationEvent = Extract<OrderStatus, "accepted" | "ready" | "delivered"> | "arrived" | "delivery_dispatched";

type OrderNotificationRow = {
  customer_phone: string | null;
  id: string;
  order_number: string;
  order_origin: string | null;
  order_type: string;
  restaurant_id: string;
  tracking_token: string;
};

function normalizePhone(value: string | null) {
  return value?.replace(/\D/g, "") ?? "";
}

function estimatedTimeLabel(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "15 min aprox.";
  const queue = payload as Record<string, unknown>;
  const minimum = Number(queue.estimated_min_minutes ?? 0);
  const maximum = Number(queue.estimated_max_minutes ?? 0);
  if (!Number.isFinite(minimum) || minimum <= 0) return "15 min aprox.";
  if (!Number.isFinite(maximum) || maximum <= minimum) return `${Math.round(minimum)} min aprox.`;
  return `${Math.round(minimum)}-${Math.round(maximum)} min aprox.`;
}

function notificationBody({
  event,
  order,
  restaurantName,
  trackingUrl,
  estimatedTime,
}: {
  event: OrderNotificationEvent;
  order: OrderNotificationRow;
  restaurantName: string;
  trackingUrl: string;
  estimatedTime: string;
}) {
  if (event === "accepted") {
    return (
      `Tu pedido ${order.order_number} fue aprobado por ${restaurantName} y ya paso a cocina.\n` +
      `Tiempo estimado: ${estimatedTime}\n` +
      `Si hay algun cambio, te avisaremos.\n\nSigue tu pedido aqui:\n${trackingUrl}`
    );
  }

  if (event === "delivery_dispatched") {
    return `Tu pedido ${order.order_number} ya fue asignado a delivery y esta en camino.\n\nSiguelo aqui:\n${trackingUrl}`;
  }

  if (event === "arrived") {
    return `El repartidor ya llego a tu ubicacion con el pedido ${order.order_number}. Por favor, preparate para recibirlo.\n\nSigue el pedido aqui:\n${trackingUrl}`;
  }

  if (event === "delivered") {
    return `Tu pedido ${order.order_number} fue marcado como entregado. Gracias por pedir en YoPido.shop.`;
  }

  return order.order_type === "delivery"
    ? `Tu pedido ${order.order_number} ya esta listo. Estamos coordinando su salida con delivery y te avisaremos cuando este en camino.\n\nSigue tu pedido aqui:\n${trackingUrl}`
    : `Tu pedido ${order.order_number} ya esta listo. Ya puedes pasar a recogerlo.\n\nSigue tu pedido aqui:\n${trackingUrl}`;
}

export async function sendOrderWhatsAppNotification({
  event,
  orderId,
}: {
  event: OrderNotificationEvent;
  orderId: string;
}) {
  const admin = createAdminClient();
  const token = process.env.WHATSAPP_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!admin || !token || !phoneNumberId) return { ok: false, error: "whatsapp-not-configured" } as const;

  const { data: rawOrder, error: orderError } = await admin
    .from("orders")
    .select("id,restaurant_id,order_number,order_origin,order_type,customer_phone,tracking_token")
    .eq("id", orderId)
    .maybeSingle();
  const order = rawOrder as OrderNotificationRow | null;
  if (orderError || !order) return { ok: false, error: "order-not-found" } as const;

  // Free-form Cloud API messages are valid here because WhatsApp orders have an active customer conversation.
  if (order.order_origin !== "phone_whatsapp") return { ok: true, skipped: "not-whatsapp-order" } as const;
  const to = normalizePhone(order.customer_phone);
  if (!to) return { ok: true, skipped: "missing-phone" } as const;

  const [{ data: restaurant }, queueResult] = await Promise.all([
    admin.from("restaurants").select("name,slug").eq("id", order.restaurant_id).maybeSingle(),
    event === "accepted"
      ? admin.rpc("get_public_order_queue_state", {
          p_order_id: order.id,
          p_tracking_token: order.tracking_token,
        })
      : Promise.resolve({ data: null }),
  ]);
  if (!restaurant?.slug) return { ok: false, error: "restaurant-not-found" } as const;

  const trackingUrl = `${getSiteUrl()}/r/${restaurant.slug}/pedido/${order.id}?token=${order.tracking_token}`;
  const body = notificationBody({
    estimatedTime: estimatedTimeLabel(queueResult.data),
    event,
    order,
    restaurantName: restaurant.name,
    trackingUrl,
  });
  const response = await fetch(`https://graph.facebook.com/v26.0/${phoneNumberId}/messages`, {
    body: JSON.stringify({
      messaging_product: "whatsapp",
      text: { body, preview_url: true },
      to,
      type: "text",
    }),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) return { ok: false, error: "whatsapp-send-failed", detail: result } as const;

  const resultRecord = result && typeof result === "object" && !Array.isArray(result) ? result as Record<string, unknown> : null;
  const messages = Array.isArray(resultRecord?.messages) ? resultRecord.messages : [];
  const firstMessage = messages[0] && typeof messages[0] === "object" && !Array.isArray(messages[0])
    ? messages[0] as Record<string, unknown>
    : null;
  const messageId = typeof firstMessage?.id === "string" ? firstMessage.id : `order-status-${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  await admin.from("whatsapp_messages").upsert(
    {
      contact_name: null,
      from_phone: to,
      message_id: messageId,
      message_text: body,
      message_type: "text",
      payload: {
        direction: "outbound",
        event,
        meta_response: result,
        order_id: order.id,
        restaurant_id: order.restaurant_id,
        source: "order_status",
      } as Json,
      received_at: now,
      to_display_phone: null,
      to_phone_number_id: phoneNumberId,
      whatsapp_timestamp: now,
    },
    { ignoreDuplicates: true, onConflict: "message_id" },
  );

  const { data: conversation } = await admin
    .from("whatsapp_conversations")
    .select("id")
    .eq("restaurant_id", order.restaurant_id)
    .eq("from_phone", to)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (conversation?.id) {
    await admin.from("whatsapp_conversations").update({
      last_intent: `order_${event}`,
      last_message_at: now,
      last_message_id: messageId,
    }).eq("id", conversation.id);
  }

  return { ok: true } as const;
}
