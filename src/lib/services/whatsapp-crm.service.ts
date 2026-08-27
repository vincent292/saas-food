import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import type { Json } from "@/types/database.types";
import type {
  WhatsAppCrmBotSettings,
  WhatsAppCrmBotTone,
  WhatsAppCrmConversation,
  WhatsAppCrmDraftSummary,
  WhatsAppCrmMessage,
  WhatsAppCrmOrderSummary,
  WhatsAppCrmWorkspace,
} from "@/types/whatsapp-crm.types";

type JsonRecord = Record<string, unknown>;

type ConversationRow = {
  id: string;
  customer_id: string;
  from_phone: string;
  restaurant_id: string | null;
  state: string;
  last_intent: string | null;
  last_message_id: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
};

type CustomerRow = {
  id: string;
  phone: string;
  display_name: string | null;
};

type MessageRow = {
  id: string;
  message_id: string;
  from_phone: string;
  contact_name: string | null;
  message_type: string;
  message_text: string | null;
  payload: Json;
  whatsapp_timestamp: string | null;
  received_at: string;
};

type DraftRow = {
  id: string;
  conversation_id: string;
  customer_name: string | null;
  customer_address: string | null;
  status: string;
  checkout_step: string;
  items: Json;
  order_type: "delivery" | "pickup" | null;
  delivery_fee: number;
  requires_prepayment: boolean;
  updated_at: string;
};

type OrderRow = {
  id: string;
  order_number: string;
  customer_phone: string | null;
  status: string;
  payment_status: string;
  order_origin: string | null;
  total: number;
  created_at: string;
};

type QuickReplyRow = {
  id: string;
  restaurant_id: string;
  title: string;
  body: string;
  category: string;
  is_active: boolean;
  updated_at: string;
};

type BotSettingsRow = {
  restaurant_id: string;
  bot_enabled: boolean;
  response_tone: WhatsAppCrmBotTone;
  greeting_message: string | null;
  menu_intro_message: string | null;
  checkout_message: string | null;
  location_request_message: string | null;
  qr_payment_message: string | null;
  receipt_request_message: string | null;
  fallback_message: string | null;
  human_handoff_message: string | null;
  updated_at: string;
};

export const DEFAULT_WHATSAPP_BOT_SETTINGS: WhatsAppCrmBotSettings = {
  botEnabled: true,
  responseTone: "friendly",
  greetingMessage: "",
  menuIntroMessage: "",
  checkoutMessage: "",
  locationRequestMessage: "",
  qrPaymentMessage: "",
  receiptRequestMessage: "",
  fallbackMessage: "",
  humanHandoffMessage: "",
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function payloadRecord(value: Json): JsonRecord {
  return isRecord(value) ? value : {};
}

function messageDirection(row: MessageRow): "inbound" | "outbound" {
  const payload = payloadRecord(row.payload);
  return payload.direction === "outbound" ? "outbound" : "inbound";
}

function fallbackMessageText(row: MessageRow) {
  if (row.message_text?.trim()) {
    return row.message_text.trim();
  }

  if (row.message_type === "location") return "Ubicacion compartida";
  if (row.message_type === "image") return "Imagen recibida";
  if (row.message_type === "document") return "Documento recibido";
  if (row.message_type === "interactive") return "Respuesta interactiva";
  return "Mensaje recibido";
}

function mapMessage(row: MessageRow): WhatsAppCrmMessage {
  const payload = payloadRecord(row.payload);

  return {
    id: row.id,
    messageId: row.message_id,
    conversationId: typeof payload.conversation_id === "string" ? payload.conversation_id : undefined,
    phone: row.from_phone,
    direction: messageDirection(row),
    type: row.message_type,
    text: fallbackMessageText(row),
    timestamp: row.whatsapp_timestamp ?? row.received_at,
  };
}

function countDraftItems(value: Json): number {
  if (!Array.isArray(value)) {
    return 0;
  }

  return value.reduce<number>((total, item) => {
    if (!isRecord(item)) return total;
    const quantity = Number(item.quantity ?? 1);
    return total + (Number.isFinite(quantity) && quantity > 0 ? quantity : 1);
  }, 0);
}

function mapDraft(row: DraftRow): WhatsAppCrmDraftSummary {
  return {
    id: row.id,
    status: row.status,
    checkoutStep: row.checkout_step,
    customerName: row.customer_name ?? "",
    customerAddress: row.customer_address ?? "",
    orderType: row.order_type,
    totalItems: countDraftItems(row.items),
    deliveryFee: Number(row.delivery_fee ?? 0),
    requiresPrepayment: row.requires_prepayment,
    updatedAt: row.updated_at,
  };
}

function mapOrder(row: OrderRow): WhatsAppCrmOrderSummary {
  return {
    id: row.id,
    orderNumber: row.order_number,
    status: row.status,
    paymentStatus: row.payment_status,
    total: Number(row.total ?? 0),
    origin: row.order_origin ?? "",
    createdAt: row.created_at,
  };
}

function mapBotSettings(row?: BotSettingsRow | null): WhatsAppCrmBotSettings {
  if (!row) {
    return DEFAULT_WHATSAPP_BOT_SETTINGS;
  }

  return {
    botEnabled: row.bot_enabled,
    responseTone: row.response_tone,
    greetingMessage: row.greeting_message ?? "",
    menuIntroMessage: row.menu_intro_message ?? "",
    checkoutMessage: row.checkout_message ?? "",
    locationRequestMessage: row.location_request_message ?? "",
    qrPaymentMessage: row.qr_payment_message ?? "",
    receiptRequestMessage: row.receipt_request_message ?? "",
    fallbackMessage: row.fallback_message ?? "",
    humanHandoffMessage: row.human_handoff_message ?? "",
    updatedAt: row.updated_at,
  };
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function startOfBoliviaDayIso(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/La_Paz",
    year: "numeric",
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value ?? date.getUTCFullYear());
  const month = Number(parts.find((part) => part.type === "month")?.value ?? date.getUTCMonth() + 1);
  const day = Number(parts.find((part) => part.type === "day")?.value ?? date.getUTCDate());

  return new Date(Date.UTC(year, month - 1, day, 4, 0, 0, 0)).toISOString();
}

async function getConversationForMessage(admin: NonNullable<ReturnType<typeof createAdminClient>>, restaurantId: string, conversationId: string) {
  const { data, error } = await admin
    .from("whatsapp_conversations")
    .select("id,from_phone,restaurant_id,state")
    .eq("id", conversationId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data;
}

export const whatsappCrmService = {
  async getWorkspace(restaurantId: string, selectedConversationId?: string): Promise<WhatsAppCrmWorkspace> {
    const whatsappConfigured = Boolean(process.env.WHATSAPP_TOKEN?.trim() && process.env.WHATSAPP_PHONE_NUMBER_ID?.trim());

    if (!hasSupabaseEnv()) {
      return {
        conversations: [],
        messages: [],
        quickReplies: [],
        botSettings: DEFAULT_WHATSAPP_BOT_SETTINGS,
        stats: { activeConversations: 0, needsReply: 0, whatsappOrders: 0, todayRevenue: 0 },
        whatsappConfigured,
      };
    }

    const admin = createAdminClient();
    if (!admin) {
      return {
        conversations: [],
        messages: [],
        quickReplies: [],
        botSettings: DEFAULT_WHATSAPP_BOT_SETTINGS,
        stats: { activeConversations: 0, needsReply: 0, whatsappOrders: 0, todayRevenue: 0 },
        whatsappConfigured: false,
      };
    }

    const [conversationsResult, quickRepliesResult, todayOrdersResult, botSettingsResult] = await Promise.all([
      admin
        .from("whatsapp_conversations")
        .select("id,customer_id,from_phone,restaurant_id,state,last_intent,last_message_id,last_message_at,created_at,updated_at")
        .eq("restaurant_id", restaurantId)
        .order("updated_at", { ascending: false })
        .limit(80),
      admin
        .from("restaurant_whatsapp_quick_replies")
        .select("id,restaurant_id,title,body,category,is_active,updated_at")
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(12),
      admin
        .from("orders")
        .select("id,total")
        .eq("restaurant_id", restaurantId)
        .eq("order_origin", "phone_whatsapp")
        .gte("created_at", startOfBoliviaDayIso()),
      admin
        .from("restaurant_whatsapp_bot_settings")
        .select("restaurant_id,bot_enabled,response_tone,greeting_message,menu_intro_message,checkout_message,location_request_message,qr_payment_message,receipt_request_message,fallback_message,human_handoff_message,updated_at")
        .eq("restaurant_id", restaurantId)
        .maybeSingle(),
    ]);

    const conversationRows = conversationsResult.data;
    const quickReplyRows = quickRepliesResult.data;
    const todayOrderRows = todayOrdersResult.data;
    const botSettings = botSettingsResult.error ? DEFAULT_WHATSAPP_BOT_SETTINGS : mapBotSettings(botSettingsResult.data as BotSettingsRow | null);
    const conversationsRaw = (conversationRows ?? []) as ConversationRow[];
    const phones = conversationsRaw.map((conversation) => conversation.from_phone);
    const customerIds = conversationsRaw.map((conversation) => conversation.customer_id);

    const [customersResult, messagesResult, draftsResult, ordersResult] = await Promise.all([
      customerIds.length
        ? admin.from("whatsapp_customers").select("id,phone,display_name").in("id", customerIds)
        : Promise.resolve({ data: [] as CustomerRow[] }),
      phones.length
        ? admin
            .from("whatsapp_messages")
            .select("id,message_id,from_phone,contact_name,message_type,message_text,payload,whatsapp_timestamp,received_at")
            .in("from_phone", phones)
            .order("received_at", { ascending: false })
            .limit(Math.max(240, phones.length * 8))
        : Promise.resolve({ data: [] as MessageRow[] }),
      conversationsRaw.length
        ? admin
            .from("whatsapp_order_drafts")
            .select("id,conversation_id,customer_name,customer_address,status,checkout_step,items,order_type,delivery_fee,requires_prepayment,updated_at")
            .in(
              "conversation_id",
              conversationsRaw.map((conversation) => conversation.id),
            )
            .order("updated_at", { ascending: false })
        : Promise.resolve({ data: [] as DraftRow[] }),
      phones.length
        ? admin
            .from("orders")
            .select("id,order_number,customer_phone,status,payment_status,order_origin,total,created_at")
            .eq("restaurant_id", restaurantId)
            .in("customer_phone", phones)
            .order("created_at", { ascending: false })
            .limit(300)
        : Promise.resolve({ data: [] as OrderRow[] }),
    ]);

    const customersById = new Map(((customersResult.data ?? []) as CustomerRow[]).map((customer) => [customer.id, customer]));
    const messages = ((messagesResult.data ?? []) as MessageRow[]).map(mapMessage);
    const latestMessageByPhone = new Map<string, WhatsAppCrmMessage>();
    const contactNameByPhone = new Map<string, string>();

    for (const row of (messagesResult.data ?? []) as MessageRow[]) {
      if (row.contact_name && !contactNameByPhone.has(row.from_phone)) {
        contactNameByPhone.set(row.from_phone, row.contact_name);
      }
    }

    for (const message of messages) {
      if (!latestMessageByPhone.has(message.phone)) {
        latestMessageByPhone.set(message.phone, message);
      }
    }

    const draftsByConversation = new Map<string, WhatsAppCrmDraftSummary>();
    for (const draft of (draftsResult.data ?? []) as DraftRow[]) {
      if (!draftsByConversation.has(draft.conversation_id) && (draft.status === "open" || draft.status === "ready_to_confirm")) {
        draftsByConversation.set(draft.conversation_id, mapDraft(draft));
      }
    }

    const ordersByPhone = new Map<string, WhatsAppCrmOrderSummary[]>();
    for (const order of ((ordersResult.data ?? []) as OrderRow[]).map(mapOrder)) {
      const phone = normalizePhone((ordersResult.data as OrderRow[]).find((row) => row.id === order.id)?.customer_phone ?? "");
      if (!phone) continue;
      const current = ordersByPhone.get(phone) ?? [];
      current.push(order);
      ordersByPhone.set(phone, current);
    }

    const conversations: WhatsAppCrmConversation[] = conversationsRaw.map((conversation) => {
      const customer = customersById.get(conversation.customer_id);
      const phone = normalizePhone(conversation.from_phone);
      const customerOrders = ordersByPhone.get(phone) ?? [];
      const lastMessage = latestMessageByPhone.get(conversation.from_phone);
      const activeDraft = draftsByConversation.get(conversation.id);
      const tags = [
        activeDraft ? "Pedido abierto" : "",
        conversation.state === "handoff" ? "Humano" : "",
        customerOrders.length >= 3 ? "Cliente frecuente" : "",
        activeDraft?.requiresPrepayment ? "QR requerido" : "",
        activeDraft?.orderType === "delivery" ? "Delivery" : "",
      ].filter(Boolean);

      return {
        id: conversation.id,
        phone: conversation.from_phone,
        displayName: customer?.display_name || contactNameByPhone.get(conversation.from_phone) || activeDraft?.customerName || conversation.from_phone,
        state: conversation.state,
        lastIntent: conversation.last_intent ?? "",
        lastMessageAt: conversation.last_message_at ?? conversation.updated_at,
        updatedAt: conversation.updated_at,
        lastMessage,
        activeDraft,
        orderCount: customerOrders.length,
        whatsappOrderCount: customerOrders.filter((order) => order.origin === "phone_whatsapp").length,
        totalSpent: customerOrders.filter((order) => order.status !== "cancelled").reduce((sum, order) => sum + order.total, 0),
        lastOrder: customerOrders[0],
        needsReply: lastMessage?.direction === "inbound",
        tags,
      };
    });

    const selectedConversation = selectedConversationId
      ? conversations.find((conversation) => conversation.id === selectedConversationId) ?? conversations[0]
      : conversations[0];

    let selectedMessages: WhatsAppCrmMessage[] = [];
    if (selectedConversation) {
      const { data } = await admin
        .from("whatsapp_messages")
        .select("id,message_id,from_phone,contact_name,message_type,message_text,payload,whatsapp_timestamp,received_at")
        .eq("from_phone", selectedConversation.phone)
        .order("received_at", { ascending: false })
        .limit(120);
      selectedMessages = ((data ?? []) as MessageRow[]).map(mapMessage).reverse();
    }

    return {
      conversations,
      selectedConversation,
      messages: selectedMessages,
      quickReplies: ((quickReplyRows ?? []) as QuickReplyRow[]).map((reply) => ({
        id: reply.id,
        title: reply.title,
        body: reply.body,
        category: reply.category,
        updatedAt: reply.updated_at,
      })),
      botSettings,
      stats: {
        activeConversations: conversations.length,
        needsReply: conversations.filter((conversation) => conversation.needsReply).length,
        whatsappOrders: todayOrderRows?.length ?? 0,
        todayRevenue: (todayOrderRows ?? []).reduce((sum, order) => sum + Number(order.total ?? 0), 0),
      },
      whatsappConfigured,
    };
  },

  async sendTextMessage({
    restaurantId,
    conversationId,
    body,
    source = "crm",
  }: {
    restaurantId: string;
    conversationId: string;
    body: string;
    source?: string;
  }) {
    const admin = createAdminClient();
    const token = process.env.WHATSAPP_TOKEN?.trim();
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();

    if (!admin || !token || !phoneNumberId) {
      return { ok: false, error: "whatsapp-not-configured" };
    }

    const conversation = await getConversationForMessage(admin, restaurantId, conversationId);
    if (!conversation) {
      return { ok: false, error: "conversation-not-found" };
    }

    const response = await fetch(`https://graph.facebook.com/v26.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: conversation.from_phone,
        type: "text",
        text: {
          body,
          preview_url: true,
        },
      }),
    });

    const result = await response.json().catch(() => null);
    if (!response.ok) {
      return { ok: false, error: "whatsapp-send-failed", detail: result };
    }

    const now = new Date().toISOString();
    const messageId = isRecord(result) && Array.isArray(result.messages) && isRecord(result.messages[0]) && typeof result.messages[0].id === "string"
      ? result.messages[0].id
      : `crm-${crypto.randomUUID()}`;

    await admin.from("whatsapp_messages").upsert(
      {
        message_id: messageId,
        from_phone: conversation.from_phone,
        to_phone_number_id: phoneNumberId,
        to_display_phone: null,
        contact_name: null,
        message_type: "text",
        message_text: body,
        payload: {
          direction: "outbound",
          source,
          restaurant_id: restaurantId,
          conversation_id: conversationId,
          meta_response: result,
        },
        whatsapp_timestamp: now,
        received_at: now,
      },
      { onConflict: "message_id", ignoreDuplicates: true },
    );

    await admin
      .from("whatsapp_conversations")
      .update({
        state: "handoff",
        last_intent: source,
        last_message_id: messageId,
        last_message_at: now,
      })
      .eq("id", conversationId)
      .eq("restaurant_id", restaurantId);

    return { ok: true };
  },

  async setHandoffState({
    restaurantId,
    conversationId,
    handoff,
  }: {
    restaurantId: string;
    conversationId: string;
    handoff: boolean;
  }) {
    const admin = createAdminClient();
    if (!admin) {
      return { ok: false, error: "supabase-not-configured" };
    }

    const { error } = await admin
      .from("whatsapp_conversations")
      .update({
        state: handoff ? "handoff" : "idle",
        last_intent: handoff ? "crm_handoff" : "crm_release",
      })
      .eq("id", conversationId)
      .eq("restaurant_id", restaurantId);

    return error ? { ok: false, error: error.code || "handoff-failed" } : { ok: true };
  },

  async saveBotSettings({
    restaurantId,
    botEnabled,
    responseTone,
    greetingMessage,
    menuIntroMessage,
    checkoutMessage,
    locationRequestMessage,
    qrPaymentMessage,
    receiptRequestMessage,
    fallbackMessage,
    humanHandoffMessage,
    userId,
  }: WhatsAppCrmBotSettings & {
    restaurantId: string;
    userId?: string;
  }) {
    const admin = createAdminClient();
    if (!admin) {
      return { ok: false, error: "supabase-not-configured" };
    }

    const { error } = await admin.from("restaurant_whatsapp_bot_settings").upsert(
      {
        restaurant_id: restaurantId,
        bot_enabled: botEnabled,
        response_tone: responseTone,
        greeting_message: emptyToNull(greetingMessage),
        menu_intro_message: emptyToNull(menuIntroMessage),
        checkout_message: emptyToNull(checkoutMessage),
        location_request_message: emptyToNull(locationRequestMessage),
        qr_payment_message: emptyToNull(qrPaymentMessage),
        receipt_request_message: emptyToNull(receiptRequestMessage),
        fallback_message: emptyToNull(fallbackMessage),
        human_handoff_message: emptyToNull(humanHandoffMessage),
        updated_by: userId ?? null,
        created_by: userId ?? null,
      },
      { onConflict: "restaurant_id" },
    );

    return error ? { ok: false, error: error.code || "bot-settings-save-failed" } : { ok: true };
  },

  async saveQuickReply({
    restaurantId,
    title,
    body,
    category = "general",
    userId,
  }: {
    restaurantId: string;
    title: string;
    body: string;
    category?: string;
    userId?: string;
  }) {
    const admin = createAdminClient();
    if (!admin) {
      return { ok: false, error: "supabase-not-configured" };
    }

    const { error } = await admin.from("restaurant_whatsapp_quick_replies").insert({
      restaurant_id: restaurantId,
      title,
      body,
      category,
      created_by: userId ?? null,
      updated_by: userId ?? null,
    });

    return error ? { ok: false, error: error.code || "quick-reply-save-failed" } : { ok: true };
  },

  async deactivateQuickReply({
    restaurantId,
    quickReplyId,
    userId,
  }: {
    restaurantId: string;
    quickReplyId: string;
    userId?: string;
  }) {
    const admin = createAdminClient();
    if (!admin) {
      return { ok: false, error: "supabase-not-configured" };
    }

    const { error } = await admin
      .from("restaurant_whatsapp_quick_replies")
      .update({
        is_active: false,
        updated_by: userId ?? null,
      })
      .eq("id", quickReplyId)
      .eq("restaurant_id", restaurantId);

    return error ? { ok: false, error: error.code || "quick-reply-delete-failed" } : { ok: true };
  },
};
