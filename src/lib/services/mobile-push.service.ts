import { createAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/types/database.types";
import type { OrderStatus } from "@/types/order.types";
import type { SupabaseClient } from "@supabase/supabase-js";

type AdminClient = SupabaseClient<Database>;

type PushRegistration = {
  appVersion?: string;
  customerPhone?: string;
  deviceId?: string;
  expoPushToken: string;
  platform?: string;
};

type OrderStatusPushInput = {
  eventType?: "order_status" | "delivery_status";
  orderId: string;
  status: OrderStatus | "arrived";
};

type OrderPushRow = {
  order_id: string;
  restaurant_id: string;
  expo_push_token: string;
  customer_phone: string | null;
};

type ExpoPushTicket = {
  details?: { error?: string };
  id?: string;
  message?: string;
  status?: string;
};

type ExpoPushResponse = {
  data?: ExpoPushTicket[];
  errors?: Array<{ code?: string; message?: string }>;
};

const expoPushEndpoint = "https://exp.host/--/api/v2/push/send";

const statusCopy: Record<OrderStatus | "arrived", { body: string; title: string }> = {
  accepted: {
    body: "El restaurante confirmo tu pedido.",
    title: "Pedido confirmado",
  },
  arrived: {
    body: "El repartidor marco llegada en tu ubicacion.",
    title: "El repartidor llego",
  },
  cancelled: {
    body: "El restaurante cancelo el pedido. Revisa el seguimiento para mas detalles.",
    title: "Pedido cancelado",
  },
  delivered: {
    body: "Tu pedido fue marcado como entregado. Gracias por pedir en yopido.shop.",
    title: "Pedido entregado",
  },
  pending: {
    body: "Recibimos tu pedido y lo enviamos al restaurante.",
    title: "Pedido recibido",
  },
  preparing: {
    body: "El equipo ya esta preparando tu pedido.",
    title: "Pedido en preparacion",
  },
  ready: {
    body: "Tu pedido esta listo. Revisa el seguimiento para continuar.",
    title: "Pedido listo",
  },
};

function isExpoPushToken(token: string) {
  return /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/.test(token.trim());
}

function uniqueTokens(rows: OrderPushRow[]) {
  return Array.from(new Set(rows.map((row) => row.expo_push_token).filter(isExpoPushToken)));
}

async function logPushAttempt(
  supabase: AdminClient,
  input: {
    body: string;
    errorMessage?: string;
    eventType: string;
    orderId?: string;
    restaurantId?: string;
    responsePayload?: Json;
    responseStatus?: string;
    status?: string;
    ticketId?: string;
    title: string;
    token?: string;
  },
) {
  await supabase.from("mobile_push_notification_logs").insert({
    body: input.body,
    error_message: input.errorMessage ?? null,
    event_type: input.eventType,
    expo_push_token: input.token ?? null,
    expo_ticket_id: input.ticketId ?? null,
    order_id: input.orderId ?? null,
    restaurant_id: input.restaurantId ?? null,
    response_payload: input.responsePayload ?? null,
    response_status: input.responseStatus ?? null,
    status: input.status ?? null,
    title: input.title,
  });
}

async function getRestaurantAndOrder(supabase: AdminClient, orderId: string) {
  const { data: order } = await supabase
    .from("orders")
    .select("id,restaurant_id,order_number,order_type,status,tracking_token")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return null;

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id,name,slug")
    .eq("id", order.restaurant_id)
    .maybeSingle();

  return { ...order, restaurant };
}

export async function registerMobilePushToken(input: PushRegistration, supabase = createAdminClient()) {
  if (!supabase || !isExpoPushToken(input.expoPushToken)) {
    return { ok: false };
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from("mobile_push_tokens").upsert(
    {
      app_version: input.appVersion ?? null,
      customer_phone: input.customerPhone?.trim() || null,
      device_id: input.deviceId ?? null,
      expo_push_token: input.expoPushToken.trim(),
      is_enabled: true,
      last_seen_at: now,
      platform: input.platform ?? null,
      updated_at: now,
    },
    { onConflict: "expo_push_token" },
  );

  return { ok: !error };
}

export async function subscribeOrderToMobilePush(
  input: PushRegistration & {
    orderId: string;
    restaurantId: string;
  },
  supabase = createAdminClient(),
) {
  if (!supabase || !isExpoPushToken(input.expoPushToken)) {
    return { ok: false };
  }

  await registerMobilePushToken(input, supabase);
  const now = new Date().toISOString();
  const { error } = await supabase.from("mobile_order_push_tokens").upsert(
    {
      customer_phone: input.customerPhone?.trim() || null,
      expo_push_token: input.expoPushToken.trim(),
      order_id: input.orderId,
      restaurant_id: input.restaurantId,
      updated_at: now,
    },
    { onConflict: "order_id,expo_push_token" },
  );

  return { ok: !error };
}

export async function sendOrderStatusPush(input: OrderStatusPushInput) {
  const supabase = createAdminClient();
  if (!supabase) {
    return { ok: false, sent: 0 };
  }

  const order = await getRestaurantAndOrder(supabase, input.orderId);
  if (!order) {
    return { ok: false, sent: 0 };
  }

  const { data: rows } = await supabase
    .from("mobile_order_push_tokens")
    .select("order_id,restaurant_id,expo_push_token,customer_phone,mobile_push_tokens!inner(is_enabled)")
    .eq("order_id", input.orderId)
    .eq("mobile_push_tokens.is_enabled", true);

  const tokens = uniqueTokens((rows ?? []) as unknown as OrderPushRow[]);
  if (!tokens.length) {
    return { ok: true, sent: 0 };
  }

  const copy = statusCopy[input.status];
  const title = `${copy.title} ${order.order_number}`;
  const body = `${order.restaurant?.name ?? "Tu restaurante"}: ${copy.body}`;
  const messages = tokens.map((token) => ({
    body,
    channelId: "order-status",
    data: {
      orderId: order.id,
      orderNumber: order.order_number,
      restaurantId: order.restaurant_id,
      restaurantSlug: order.restaurant?.slug ?? "",
      status: input.status,
      trackingToken: order.tracking_token,
      type: "order_status",
    },
    priority: "high",
    sound: "default",
    title,
    to: token,
  }));

  try {
    const response = await fetch(expoPushEndpoint, {
      body: JSON.stringify(messages),
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    const responsePayload = (await response.json().catch(() => null)) as Json;
    const expoResponse = responsePayload as ExpoPushResponse | null;
    const tickets = Array.isArray(expoResponse?.data) ? expoResponse.data : [];
    const requestError = expoResponse?.errors
      ?.map((error) => [error.code, error.message].filter(Boolean).join(": "))
      .filter(Boolean)
      .join(" | ");

    await Promise.all(
      tokens.map((token, index) => {
        const ticket = tickets[index] ?? null;
        return logPushAttempt(supabase, {
          body,
          errorMessage: ticket?.message ?? requestError,
          eventType: input.eventType ?? "order_status",
          orderId: order.id,
          responsePayload,
          responseStatus: ticket?.status ?? `http_${response.status}`,
          restaurantId: order.restaurant_id,
          status: input.status,
          ticketId: ticket?.id,
          title,
          token,
        });
      }),
    );

    const acceptedTokens = tokens.filter((_token, index) => tickets[index]?.status === "ok");
    if (acceptedTokens.length) {
      await supabase
        .from("mobile_order_push_tokens")
        .update({
          last_notified_at: new Date().toISOString(),
          last_notified_status: input.status,
        })
        .eq("order_id", input.orderId)
        .in("expo_push_token", acceptedTokens);
    }

    return { ok: response.ok && acceptedTokens.length === tokens.length, sent: acceptedTokens.length };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "expo-push-failed";
    await Promise.all(
      tokens.map((token) =>
        logPushAttempt(supabase, {
          body,
          errorMessage,
          eventType: input.eventType ?? "order_status",
          orderId: order.id,
          restaurantId: order.restaurant_id,
          status: input.status,
          title,
          token,
        }),
      ),
    );
    return { ok: false, sent: 0 };
  }
}
