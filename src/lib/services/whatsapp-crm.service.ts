import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { insideWhatsAppReplyWindow, metaGraphVersion, resolveWhatsAppSender } from "@/lib/services/whatsapp-connection.service";
import type { Json } from "@/types/database.types";
import type {
  WhatsAppCrmBotSettings,
  WhatsAppCrmBotTone,
  WhatsAppCrmConversation,
  WhatsAppCrmDraftSummary,
  WhatsAppCrmMessage,
  WhatsAppCrmUsage,
  WhatsAppCrmOrderSummary,
  WhatsAppCrmWorkspace,
} from "@/types/whatsapp-crm.types";

type JsonRecord = Record<string, unknown>;

type ConversationRow = {
  id: string;
  channel_key: string;
  last_customer_message_at: string | null;
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
  conversation_id: string | null;
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
    conversationId: row.conversation_id ?? (typeof payload.conversation_id === "string" ? payload.conversation_id : undefined),
    phone: row.from_phone,
    direction: messageDirection(row),
    type: row.message_type,
    text: fallbackMessageText(row),
    timestamp: row.whatsapp_timestamp ?? row.received_at,
    source: typeof payload.source === "string" ? payload.source : undefined,
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

function startOfBoliviaMonthIso(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { month: "2-digit", timeZone: "America/La_Paz", year: "numeric" }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value ?? date.getUTCFullYear());
  const month = Number(parts.find((part) => part.type === "month")?.value ?? date.getUTCMonth() + 1);
  return new Date(Date.UTC(year, month - 1, 1, 4, 0, 0, 0)).toISOString();
}

const emptyUsage: WhatsAppCrmUsage = {
  apiMessagesThisMonth: 0,
  receivedMessagesThisMonth: 0,
  metaSentMessages: null,
  metaDeliveredMessages: null,
  adProtectedMessages: null,
  freeServiceMessagesLimit: 1000,
  freeServiceMessagesUsed: null,
  freeServiceMessagesRemaining: null,
  billableServiceMessages: null,
  billableMessages: null,
  estimatedServiceCostUsd: null,
  metaCost: null,
  metaCurrency: null,
  pricingStatus: "unavailable",
  costStatus: "unavailable",
  lastSyncedAt: null,
  periodStart: startOfBoliviaMonthIso(),
  conversationsFromMetaEntry: 0,
  conversationsDirect: 0,
};

type MetaUsage = Pick<WhatsAppCrmUsage, "metaSentMessages" | "metaDeliveredMessages" | "adProtectedMessages" |
  "freeServiceMessagesUsed" | "freeServiceMessagesRemaining" | "billableServiceMessages" | "billableMessages" |
  "estimatedServiceCostUsd" | "metaCost" | "metaCurrency" | "pricingStatus" | "costStatus" | "lastSyncedAt">;
type UsageConnection = { phone_number_id: string; waba_id: string; display_phone_number: string };
const usageCache = new Map<string, { expires: number; value: MetaUsage }>();

// Only Meta's pricing classification consumes the service allowance. An API
// send, a customer message, or a Business App echo is not a delivered charge.
export function summarizeMetaWhatsAppUsage(payload: unknown, phone: string, partnerBilling = false): MetaUsage {
  const result: MetaUsage = {
    metaSentMessages: null, metaDeliveredMessages: null, adProtectedMessages: null,
    freeServiceMessagesUsed: null, freeServiceMessagesRemaining: null, billableServiceMessages: null,
    billableMessages: null, estimatedServiceCostUsd: null, metaCost: null, metaCurrency: null, pricingStatus: "unavailable",
    costStatus: "unavailable", lastSyncedAt: null,
  };
  if (!isRecord(payload)) return result;
  const pricing = payload.pricing_analytics;
  if (!isRecord(pricing) || !Array.isArray(pricing.data)) return result;
  let free = 0, paidService = 0, paid = 0, adFree = 0, cost = 0, hasCost = false, completeCost = true;
  let estimatedServiceCostUsd = 0, serviceEstimateComplete = true;
  // Official USD rate card, effective 2026-10-01: Bolivia belongs to Rest of
  // Latin America, SERVICE = USD 0.0113. This is not a provider invoice.
  // https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
  const boliviaServiceRateUsd = 0.0113;
  const serviceRateEffectiveFrom = Date.parse("2026-10-01T00:00:00Z") / 1000;
  const allowedTypes = new Set(["REGULAR", "FREE_CUSTOMER_SERVICE", "FREE_ENTRY_POINT"]);
  for (const group of pricing.data) {
    if (!isRecord(group) || !Array.isArray(group.data_points)) return result;
    for (const point of group.data_points) {
      if (!isRecord(point) || String(point.phone_number ?? "").replace(/\D/g, "") !== phone) continue;
      if (typeof point.volume !== "number" || !Number.isSafeInteger(point.volume) || point.volume < 0 ||
        typeof point.pricing_type !== "string" || !allowedTypes.has(point.pricing_type) || typeof point.pricing_category !== "string") return result;
      const service = point.pricing_category === "SERVICE";
      if (point.pricing_type === "FREE_CUSTOMER_SERVICE" && service) free += point.volume;
      if (point.pricing_type === "REGULAR") { paid += point.volume; if (service) paidService += point.volume; }
      if (point.pricing_type === "REGULAR" && service && point.volume > 0) {
        if (point.country === "BO" && typeof point.start === "number" && point.start >= serviceRateEffectiveFrom) {
          estimatedServiceCostUsd += point.volume * boliviaServiceRateUsd;
        } else serviceEstimateComplete = false;
      }
      if (point.pricing_type === "FREE_ENTRY_POINT") adFree += point.volume;
      if (typeof point.cost === "number" && Number.isFinite(point.cost) && point.cost >= 0) { cost += point.cost; hasCost = true; }
      else if (point.pricing_type === "REGULAR" && point.volume > 0) completeCost = false;
    }
  }
  // Cost has no meaning without its billing currency. Missing COST must never
  // silently become a zero invoice, including partner-billed accounts.
  const currency = typeof payload.currency === "string" && /^[A-Z]{3}$/.test(payload.currency) ? payload.currency : null;
  const analytics = payload.analytics;
  if (isRecord(analytics) && Array.isArray(analytics.data_points)) {
    let sent = 0, delivered = 0, valid = true;
    for (const point of analytics.data_points) {
      if (!isRecord(point) || typeof point.sent !== "number" || typeof point.delivered !== "number" ||
        !Number.isSafeInteger(point.sent) || !Number.isSafeInteger(point.delivered) || point.sent < 0 || point.delivered < 0) { valid = false; break; }
      sent += point.sent; delivered += point.delivered;
    }
    if (valid) { result.metaSentMessages = sent; result.metaDeliveredMessages = delivered; }
  }
  const quotaUsed = paidService > 0 ? 1000 : Math.min(1000, free);
  const costAvailable = hasCost && completeCost && currency !== null && !partnerBilling;
  return {
    ...result, pricingStatus: "synced", freeServiceMessagesUsed: quotaUsed,
    freeServiceMessagesRemaining: 1000 - quotaUsed, billableServiceMessages: paidService,
    billableMessages: paid, adProtectedMessages: adFree, metaCost: costAvailable ? cost : null,
    estimatedServiceCostUsd: serviceEstimateComplete ? Math.round(estimatedServiceCostUsd * 1e6) / 1e6 : null,
    metaCurrency: currency, costStatus: partnerBilling ? "partner_billing" : costAvailable ? "available" : "unavailable",
    lastSyncedAt: new Date().toISOString(),
  };
}

export async function fetchMetaWhatsAppUsage(restaurantId: string, connection: UsageConnection | null): Promise<MetaUsage | null> {
  if (!connection?.phone_number_id || !connection.waba_id || !connection.display_phone_number) return null;
  const start = startOfBoliviaMonthIso();
  const key = `${restaurantId}:${connection.phone_number_id}:${start}`;
  const cached = usageCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  const sender = await resolveWhatsAppSender(restaurantId, connection.phone_number_id);
  if (!sender) return null;
  const phone = connection.display_phone_number.replace(/\D/g, "");
  const period = `start(${Math.floor(Date.parse(start) / 1000)}).end(${Math.floor(Date.now() / 1000)})`;
  const filters = `phone_numbers(["${phone}"])`;
  const dimensions = 'dimensions(["PHONE","COUNTRY","PRICING_CATEGORY","PRICING_TYPE"])';
  async function request(includeCost: boolean) {
    const url = new URL(`https://graph.facebook.com/${metaGraphVersion}/${connection!.waba_id}`);
    url.searchParams.set("fields", ["currency",
      `pricing_analytics.${period}.granularity(DAILY).${filters}.metric_types(${includeCost ? '["COST","VOLUME"]' : '["VOLUME"]'}).${dimensions}`,
      `analytics.${period}.granularity(DAY).${filters}`].join(","));
    const response = await fetch(url, { headers: { Authorization: `Bearer ${sender!.token}` }, cache: "no-store", signal: AbortSignal.timeout(5000) });
    return { response, payload: await response.json() as unknown };
  }
  try {
    let { response, payload } = await request(true);
    const error = isRecord(payload) && isRecord(payload.error) ? payload.error : null;
    const partnerBilling = error?.code === 10 && error.error_subcode === 2388184;
    if (partnerBilling) ({ response, payload } = await request(false));
    if (!response.ok) return null;
    const value = summarizeMetaWhatsAppUsage(payload, phone, partnerBilling);
    // Server-only, short-lived cache: no access tokens or ciphertext stored.
    if (usageCache.size >= 256) usageCache.delete(usageCache.keys().next().value!);
    usageCache.set(key, { expires: Date.now() + 60000, value });
    return value;
  } catch { return null; }
}

function acquisitionForConversation(rows: MessageRow[]) {
  const firstInbound = [...rows]
    .filter((row) => messageDirection(row) === "inbound")
    .sort((a, b) => (a.received_at ?? "").localeCompare(b.received_at ?? ""))[0];
  const payload = firstInbound ? payloadRecord(firstInbound.payload) : {};
  const message = payloadRecord(payload.message as Json);
  const explicitReferral = payloadRecord(payload.referral as Json);
  const referral = Object.keys(explicitReferral).length ? explicitReferral : payloadRecord(message.referral as Json);
  const hasMetaEntry = Boolean(referral.ctwa_clid || referral.source_id || referral.source_url);
  const headline = typeof referral.headline === "string" ? referral.headline.trim() : "";
  const sourceType = typeof referral.source_type === "string" ? referral.source_type.trim() : "";

  return {
    source: hasMetaEntry ? "meta_entry" as const : "direct" as const,
    detail: hasMetaEntry ? headline || (sourceType ? `Entrada Meta: ${sourceType}` : "Anuncio o CTA de Meta") : "Directo / sin atribucion de Meta",
  };
}

async function getConversationForMessage(admin: NonNullable<ReturnType<typeof createAdminClient>>, restaurantId: string, conversationId: string) {
  const { data, error } = await admin
    .from("whatsapp_conversations")
    .select("id,from_phone,restaurant_id,state,channel_key,last_customer_message_at")
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
    let whatsappConfigured = Boolean(process.env.WHATSAPP_TOKEN?.trim() && process.env.WHATSAPP_PHONE_NUMBER_ID?.trim());

    if (!hasSupabaseEnv()) {
      return {
        conversations: [],
        messages: [],
        quickReplies: [],
        botSettings: DEFAULT_WHATSAPP_BOT_SETTINGS,
        stats: { activeConversations: 0, needsReply: 0, whatsappOrders: 0, todayRevenue: 0 },
        usage: emptyUsage,
        whatsappConfigured,
        branchConnectionStatus: null,
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
        usage: emptyUsage,
        whatsappConfigured: false,
        branchConnectionStatus: null,
      };
    }

    const [conversationsResult, quickRepliesResult, todayOrdersResult, botSettingsResult, connectionResult] = await Promise.all([
      admin
        .from("whatsapp_conversations")
        .select("id,customer_id,from_phone,restaurant_id,state,last_intent,last_message_id,last_message_at,created_at,updated_at,channel_key,last_customer_message_at")
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
      admin.from("restaurant_whatsapp_connections").select("status,token_expires_at,phone_number_id,waba_id,display_phone_number").eq("restaurant_id", restaurantId).maybeSingle(),
    ]);
    const connection = connectionResult.data;
    const branchConnectionStatus: WhatsAppCrmWorkspace["branchConnectionStatus"] = connection
      ? connection.status === "connected" && connection.token_expires_at && Date.parse(connection.token_expires_at) <= Date.now()
        ? "needs_reconnect" : connection.status
      : null;
    whatsappConfigured ||= branchConnectionStatus === "connected";

    const conversationRows = conversationsResult.data;
    const quickReplyRows = quickRepliesResult.data;
    const todayOrderRows = todayOrdersResult.data;
    const botSettings = botSettingsResult.error ? DEFAULT_WHATSAPP_BOT_SETTINGS : mapBotSettings(botSettingsResult.data as BotSettingsRow | null);
    const conversationsRaw = (conversationRows ?? []) as ConversationRow[];
    const phones = conversationsRaw.map((conversation) => conversation.from_phone);
    const customerIds = conversationsRaw.map((conversation) => conversation.customer_id);

    const [customersResult, messagesResult, receivedCountResult, sentCountResult, metaUsage, draftsResult, ordersResult, monthlyMessagesResult, campaignWindowsResult] = await Promise.all([
      customerIds.length
        ? admin.from("whatsapp_customers").select("id,phone,display_name").in("id", customerIds)
        : Promise.resolve({ data: [] as CustomerRow[] }),
      phones.length
        ? admin
            .from("whatsapp_messages")
            .select("id,conversation_id,message_id,from_phone,contact_name,message_type,message_text,payload,whatsapp_timestamp,received_at")
            .in("conversation_id", conversationsRaw.map((conversation) => conversation.id))
            .order("received_at", { ascending: false })
            .limit(Math.max(240, phones.length * 8))
        : Promise.resolve({ data: [] as MessageRow[] }),
      connection?.phone_number_id
        ? admin.from("whatsapp_messages").select("id", { count: "exact", head: true })
          .eq("to_phone_number_id", connection.phone_number_id).gte("received_at", startOfBoliviaMonthIso())
          .eq("payload->>direction", "inbound")
        : Promise.resolve({ count: null, error: null }),
      connection?.phone_number_id
        ? admin.from("whatsapp_messages").select("id", { count: "exact", head: true })
          .eq("to_phone_number_id", connection.phone_number_id).gte("received_at", startOfBoliviaMonthIso())
          .eq("payload->>direction", "outbound").neq("payload->>source", "business_app")
        : Promise.resolve({ count: null, error: null }),
      fetchMetaWhatsAppUsage(restaurantId, connection),
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
      conversationsRaw.length
        ? admin
            .from("whatsapp_messages")
            .select("id,conversation_id,message_id,from_phone,contact_name,message_type,message_text,payload,whatsapp_timestamp,received_at")
            .in("conversation_id", conversationsRaw.map((conversation) => conversation.id))
            .gte("received_at", startOfBoliviaMonthIso())
            .order("received_at", { ascending: true })
            .limit(20000)
        : Promise.resolve({ data: [] as MessageRow[] }),
      phones.length && connection?.phone_number_id
        ? admin.from("whatsapp_free_entry_windows").select("phone_number_id,customer_phone,expires_at")
          .eq("restaurant_id", restaurantId).eq("phone_number_id", connection.phone_number_id)
          .in("customer_phone", phones).gt("expires_at", new Date().toISOString())
        : Promise.resolve({ data: [] }),
    ]);

    const confirmedCampaignWindows = new Map<string, string>((campaignWindowsResult.data ?? []).map((window: { phone_number_id: string; customer_phone: string; expires_at: string }) =>
      [`${window.phone_number_id}:${window.customer_phone}`, window.expires_at]));
    const customersById = new Map(((customersResult.data ?? []) as CustomerRow[]).map((customer) => [customer.id, customer]));
    const messages = ((messagesResult.data ?? []) as MessageRow[]).map(mapMessage);
    const latestMessageByConversation = new Map<string, WhatsAppCrmMessage>();
    const contactNameByConversation = new Map<string, string>();

    for (const row of (messagesResult.data ?? []) as MessageRow[]) {
      if (row.contact_name && row.conversation_id && !contactNameByConversation.has(row.conversation_id)) {
        contactNameByConversation.set(row.conversation_id, row.contact_name);
      }
    }

    for (const message of messages) {
      if (message.conversationId && !latestMessageByConversation.has(message.conversationId)) {
        latestMessageByConversation.set(message.conversationId, message);
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

    const monthlyRowsByConversation = new Map<string, MessageRow[]>();
    for (const row of (monthlyMessagesResult.data ?? []) as MessageRow[]) {
      if (!row.conversation_id) continue;
      const current = monthlyRowsByConversation.get(row.conversation_id) ?? [];
      current.push(row);
      monthlyRowsByConversation.set(row.conversation_id, current);
    }

    const acquisitionsByConversation = new Map<string, ReturnType<typeof acquisitionForConversation>>();
    for (const [conversationId, rows] of monthlyRowsByConversation) {
      acquisitionsByConversation.set(conversationId, acquisitionForConversation(rows));
    }

    const conversations: WhatsAppCrmConversation[] = conversationsRaw.map((conversation) => {
      const customer = customersById.get(conversation.customer_id);
      const phone = normalizePhone(conversation.from_phone);
      const customerOrders = ordersByPhone.get(phone) ?? [];
      const activeOrder = customerOrders.find((order) => ["pending", "accepted", "preparing", "ready"].includes(order.status));
      const lastMessage = latestMessageByConversation.get(conversation.id);
      const activeDraft = draftsByConversation.get(conversation.id);
      const acquisition = acquisitionsByConversation.get(conversation.id) ?? { source: "direct" as const, detail: "Directo / sin atribucion de Meta" };
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
        displayName: activeDraft?.customerName || contactNameByConversation.get(conversation.id) || (conversation.channel_key === "platform" ? customer?.display_name : null) || conversation.from_phone,
        state: conversation.state,
        channel: conversation.channel_key === "platform" ? "platform" : "branch",
        canReply: insideWhatsAppReplyWindow(conversation.last_customer_message_at),
        lastIntent: conversation.last_intent ?? "",
        lastMessageAt: conversation.last_message_at ?? conversation.updated_at,
        updatedAt: conversation.updated_at,
        lastMessage,
        activeDraft,
        orderCount: customerOrders.length,
        whatsappOrderCount: customerOrders.filter((order) => order.origin === "phone_whatsapp").length,
        totalSpent: customerOrders.filter((order) => order.status !== "cancelled").reduce((sum, order) => sum + order.total, 0),
        activeOrder,
        lastOrder: customerOrders[0],
        needsReply: lastMessage?.direction === "inbound",
        tags,
        acquisitionSource: acquisition.source,
        acquisitionDetail: acquisition.detail,
        freeWindowExpiresAt: confirmedCampaignWindows.get(`${conversation.channel_key}:${conversation.from_phone}`),
      };
    });

    let apiMessagesThisMonth = 0;
    let receivedMessagesThisMonth = 0;
    for (const row of (monthlyMessagesResult.data ?? []) as MessageRow[]) {
      if (messageDirection(row) === "inbound") { receivedMessagesThisMonth += 1; continue; }
      if (payloadRecord(row.payload).source === "business_app") continue;
      apiMessagesThisMonth += 1;
    }
    const usage: WhatsAppCrmUsage = {
      ...emptyUsage,
      periodStart: startOfBoliviaMonthIso(),
      ...metaUsage,
      apiMessagesThisMonth: !sentCountResult.error && typeof sentCountResult.count === "number" ? sentCountResult.count : apiMessagesThisMonth,
      receivedMessagesThisMonth: !receivedCountResult.error && typeof receivedCountResult.count === "number" ? receivedCountResult.count : receivedMessagesThisMonth,
      conversationsFromMetaEntry: conversations.filter((conversation) => conversation.acquisitionSource === "meta_entry").length,
      conversationsDirect: conversations.filter((conversation) => conversation.acquisitionSource === "direct").length,
    };

    const defaultConversation = branchConnectionStatus
      ? conversations.find((conversation) => conversation.channel === "branch")
      : conversations[0];
    const selectedConversation = selectedConversationId
      ? conversations.find((conversation) => conversation.id === selectedConversationId) ?? defaultConversation
      : defaultConversation;

    let selectedMessages: WhatsAppCrmMessage[] = [];
    if (selectedConversation) {
      const { data } = await admin
        .from("whatsapp_messages")
        .select("id,conversation_id,message_id,from_phone,contact_name,message_type,message_text,payload,whatsapp_timestamp,received_at")
        .eq("conversation_id", selectedConversation.id)
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
      usage,
      whatsappConfigured,
      branchConnectionStatus,
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
    if (!admin) {
      return { ok: false, error: "whatsapp-not-configured" };
    }

    const conversation = await getConversationForMessage(admin, restaurantId, conversationId);
    if (!conversation) {
      return { ok: false, error: "conversation-not-found" };
    }
    const sender = await resolveWhatsAppSender(restaurantId, conversation.channel_key);
    if (!sender) return { ok: false, error: "whatsapp-not-configured" };
    if (!insideWhatsAppReplyWindow(conversation.last_customer_message_at)) return { ok: false, error: "whatsapp-window-closed" };
    const { token, phoneNumberId } = sender;
    const response = await fetch(`https://graph.facebook.com/${metaGraphVersion}/${phoneNumberId}/messages`, {
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
        conversation_id: conversationId,
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
