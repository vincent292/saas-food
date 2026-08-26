// @ts-expect-error -- Supabase Edge Functions resolve remote Deno imports at deploy time.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const GRAPH_API_VERSION = "v26.0";
const RESTAURANT_TIME_ZONE = "America/La_Paz";
const RECEIPT_BUCKET = "whatsapp-payment-receipts";
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
const DRAFT_SELECT =
  "id,conversation_id,customer_id,restaurant_id,status,items,checkout_step,pending_item,customer_name,customer_address,customer_address_detail,delivery_latitude,delivery_longitude,delivery_maps_url,delivery_distance_km,delivery_fee,requires_prepayment,requested_fulfillment_at,order_type,payment_method,payment_receipt_url,payment_receipt_media_id,invoice_required,invoice_document_type,invoice_document_number,invoice_name,notes,created_order_id";

type JsonObject = Record<string, unknown>;

type WhatsAppMessageRow = {
  message_id: string;
  from_phone: string;
  to_phone_number_id: string | null;
  to_display_phone: string | null;
  contact_name: string | null;
  message_type: string;
  message_text: string | null;
  payload: JsonObject;
  whatsapp_timestamp: string | null;
  received_at: string;
};

type WhatsAppCustomerRow = {
  id: string;
  phone: string;
};

type WhatsAppConversationRow = {
  id: string;
  customer_id: string;
  from_phone: string;
  restaurant_id: string | null;
  state: string;
};

type RestaurantRow = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  public_category: string | null;
  address: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
};

type ProductSummaryRow = {
  id: string;
  name: string;
  price: number | string;
  category_id: string | null;
  description: string | null;
  image_url: string | null;
  is_featured: boolean;
  product_kind: "standard" | "promotion" | "lunch" | null;
  available_from: string | null;
  available_until: string | null;
  available_days: number[] | null;
  available_start_time: string | null;
  available_end_time: string | null;
};

type CategoryRow = {
  id: string;
  name: string;
};

type ProductVariantRow = {
  id: string;
  product_id: string;
  name: string;
  price_delta: number | string;
  is_active: boolean;
};

type ProductOptionGroupRow = {
  id: string;
  product_id: string;
  name: string;
  min_choices: number;
  max_choices: number;
  is_required: boolean;
  is_active: boolean;
};

type ProductOptionRow = {
  id: string;
  product_id: string;
  option_group_id: string;
  name: string;
  price_delta: number | string;
  is_active: boolean;
};

type PendingDraftItem = {
  product_id: string;
  product_name: string;
  base_price: number;
  variant_id: string | null;
  variant_name: string | null;
  option_ids: string[];
  option_names: string[];
  group_index: number;
  quantity: number | null;
};

type DraftItem = {
  cart_id: string;
  product_id: string;
  product_name: string;
  variant_id: string | null;
  option_ids: string[];
  unit_price: number;
  quantity: number;
  subtotal: number;
  notes: string | null;
};

type WhatsAppOrderDraftRow = {
  id: string;
  conversation_id: string;
  customer_id: string;
  restaurant_id: string | null;
  status: string;
  items: DraftItem[];
  checkout_step: string;
  pending_item: PendingDraftItem | null;
  customer_name: string | null;
  customer_address: string | null;
  customer_address_detail: string | null;
  delivery_latitude: number | null;
  delivery_longitude: number | null;
  delivery_maps_url: string | null;
  delivery_distance_km: number | null;
  delivery_fee: number;
  requires_prepayment: boolean;
  requested_fulfillment_at: string | null;
  order_type: "delivery" | "pickup" | null;
  payment_method: "cash" | "qr" | null;
  payment_receipt_url: string | null;
  payment_receipt_media_id: string | null;
  invoice_required: boolean | null;
  invoice_document_type: string | null;
  invoice_document_number: string | null;
  invoice_name: string | null;
  notes: string | null;
  created_order_id: string | null;
};

type RestaurantSettingsRow = {
  delivery_enabled: boolean;
  pickup_enabled: boolean;
  delivery_fee: number | string;
  delivery_qr_prepayment_enabled: boolean;
  far_delivery_distance_km: number | string;
  free_delivery_from: number | string | null;
  min_order_amount: number | string;
  currency: string;
  invoice_enabled: boolean;
  qr_payment_url: string | null;
};

type DeliveryZoneRow = {
  id: string;
  name: string;
  city: string | null;
  center_latitude: number | string | null;
  center_longitude: number | string | null;
  radius_km: number | string;
  delivery_fee: number | string;
  min_order_amount: number | string;
  is_active: boolean;
};

type BusinessHourRow = {
  day_of_week: number;
  opens_at: string | null;
  closes_at: string | null;
  is_closed: boolean;
};

type DeliveryPolicy = {
  distanceKm: number;
  deliveryFee: number;
  minOrderAmount: number;
  requiresQrPrepayment: boolean;
  sameCity: boolean;
  zoneName: string | null;
};

type ValidatedDraftOrder = {
  draft: WhatsAppOrderDraftRow;
  restaurant: RestaurantRow;
  settings: RestaurantSettingsRow;
  items: DraftItem[];
  subtotal: number;
  deliveryPolicy: DeliveryPolicy | null;
  total: number;
};

type RecentOrderRow = {
  order_number: string;
  status: string;
  payment_status: string;
  total: number | string;
  created_at: string;
};

type CreatedOrderRow = {
  id: string;
  tracking_token: string;
};

type ProductTextMatch = {
  product: ProductSummaryRow | null;
  quantity: number | null;
  candidates: ProductSummaryRow[];
};

type CompactCheckoutInput = {
  hasSignal: boolean;
  orderType: "delivery" | "pickup" | null;
  fulfillment: "now" | "schedule" | null;
  scheduledIso: string | null;
  scheduledLocalInput: string | null;
  customerName: string | null;
  customerAddress: string | null;
  customerAddressDetail: string | null;
  paymentMethod: "cash" | "qr" | null;
  invoiceRequired: boolean | null;
  invoiceFields: {
    documentType: string;
    documentNumber: string;
    name: string;
  } | null;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (request) => {
  try {
    if (request.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (request.method === "GET") {
      return verifyMetaWebhook(request);
    }

    if (request.method === "POST") {
      return receiveWhatsAppWebhook(request);
    }

    return jsonResponse({ error: "method_not_allowed" }, 405);
  } catch (error) {
    console.error("whatsapp-webhook error", error);
    return jsonResponse({ error: "internal_error" }, 500);
  }
});

function verifyMetaWebhook(request: Request) {
  const verifyToken = getVerifyToken();

  if (!verifyToken) {
    return new Response("VERIFY_TOKEN is not configured", {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "text/plain" },
    });
  }

  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === verifyToken && challenge) {
    return new Response(challenge, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/plain" },
    });
  }

  return new Response("Forbidden", {
    status: 403,
    headers: { ...corsHeaders, "Content-Type": "text/plain" },
  });
}

async function receiveWhatsAppWebhook(request: Request) {
  const rawBody = await request.text();
  if (!(await hasValidMetaSignature(request, rawBody))) {
    console.warn("WhatsApp webhook rejected: invalid Meta signature");
    return jsonResponse({ error: "invalid_signature" }, 401);
  }

  let payload: JsonObject;
  try {
    payload = objectValue(JSON.parse(rawBody));
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }
  const rows = [...new Map(extractIncomingMessageRows(payload).map((row) => [row.message_id, row])).values()];

  console.log(
    "WhatsApp webhook:",
    JSON.stringify({
      messages: rows.map((row) => ({
        from: maskPhone(row.from_phone),
        type: row.message_type,
        text: summarizeText(row.message_text),
      })),
    }),
  );

  if (rows.length === 0) {
    return jsonResponse({ ok: true, saved: 0 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: insertedMessages, error } = await supabase
    .from("whatsapp_messages")
    .upsert(rows, { onConflict: "message_id", ignoreDuplicates: true })
    .select("message_id");

  if (error) {
    console.error("Could not save WhatsApp messages", error);
    return jsonResponse({ error: "database_insert_failed" }, 500);
  }

  const insertedIds = new Set((insertedMessages ?? []).map((message: { message_id: string }) => message.message_id));
  const newRows = rows.filter((row) => insertedIds.has(row.message_id));

  for (const row of newRows) {
    try {
      await handleIncomingWhatsAppMessage(supabase, row);
    } catch (error) {
      console.error(
        "Could not process WhatsApp reply",
        JSON.stringify({
          messageId: row.message_id,
          from: maskPhone(row.from_phone),
          error: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }

  return jsonResponse({ ok: true, saved: newRows.length });
}

async function hasValidMetaSignature(request: Request, rawBody: string) {
  const appSecret = Deno.env.get("META_APP_SECRET")?.trim();
  if (!appSecret) {
    return true;
  }

  const signature = request.headers.get("x-hub-signature-256")?.trim().toLowerCase();
  if (!signature?.startsWith("sha256=")) {
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = `sha256=${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  return timingSafeEqual(expected, signature);
}

function createSupabaseAdminClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function extractIncomingMessageRows(payload: JsonObject) {
  const rows: WhatsAppMessageRow[] = [];
  const entries = recordArray(payload.entry);

  for (const entry of entries) {
    const changes = recordArray(entry.changes);

    for (const change of changes) {
      const value = objectValue(change.value);
      const messages = recordArray(value.messages);
      const contacts = recordArray(value.contacts);
      const metadata = objectValue(value.metadata);

      for (const message of messages) {
        const messageId = stringValue(message.id);
        const fromPhone = stringValue(message.from);

        if (!messageId || !fromPhone) {
          continue;
        }

        const contact = contacts.find((item) => stringValue(item.wa_id) === fromPhone);

        rows.push({
          message_id: messageId,
          from_phone: fromPhone,
          to_phone_number_id: stringValue(metadata.phone_number_id) ?? Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? null,
          to_display_phone: stringValue(metadata.display_phone_number),
          contact_name: stringValue(objectValue(contact?.profile).name),
          message_type: stringValue(message.type) ?? "unknown",
          message_text: extractMessageText(message),
          payload: {
            object: payload.object ?? null,
            entry_id: entry.id ?? null,
            change_field: change.field ?? null,
            value,
            message,
          },
          whatsapp_timestamp: parseWhatsAppTimestamp(stringValue(message.timestamp)),
          received_at: new Date().toISOString(),
        });
      }
    }
  }

  return rows;
}

function extractMessageText(message: JsonObject) {
  if (message.type === "text") {
    return stringValue(objectValue(message.text).body);
  }

  if (message.type === "button") {
    const button = objectValue(message.button);
    return stringValue(button.text) ?? stringValue(button.payload);
  }

  if (message.type === "interactive") {
    const interactive = objectValue(message.interactive);
    const buttonReply = objectValue(interactive.button_reply);
    const listReply = objectValue(interactive.list_reply);

    return (
      stringValue(buttonReply.title) ??
      stringValue(buttonReply.id) ??
      stringValue(listReply.title) ??
      stringValue(listReply.id) ??
      null
    );
  }

  if (message.type === "image") {
    return stringValue(objectValue(message.image).caption);
  }

  if (message.type === "video") {
    return stringValue(objectValue(message.video).caption);
  }

  if (message.type === "document") {
    const document = objectValue(message.document);
    return stringValue(document.caption) ?? stringValue(document.filename);
  }

  if (message.type === "location") {
    const location = objectValue(message.location);
    return stringValue(location.address) ?? stringValue(location.name) ?? "Ubicacion compartida";
  }

  if (message.type === "reaction") {
    return stringValue(objectValue(message.reaction).emoji);
  }

  return null;
}

async function handleIncomingWhatsAppMessage(supabase: ReturnType<typeof createSupabaseAdminClient>, row: WhatsAppMessageRow) {
  const { customer, conversation } = await ensureWhatsAppConversation(supabase, row);
  const command = extractCommand(row);
  const normalized = normalizeForMatch(command.text);

  if (command.kind === "restaurant_select" && command.value) {
    const restaurant = await findRestaurantById(supabase, command.value);
    if (restaurant) {
      if (conversation.restaurant_id && conversation.restaurant_id !== restaurant.id) {
        await abandonOpenDraft(supabase, conversation.id);
      }
      await setConversationRestaurant(supabase, conversation.id, restaurant.id, "browsing_menu", "restaurant_selected", row.message_id);
      await sendRestaurantMenuIntro(row.from_phone, restaurant, await listTopProducts(supabase, restaurant.id));
      return;
    }
  }

  if (command.kind === "ACTION_CHANGE_RESTAURANT" || (conversation.state !== "drafting_order" && isChangeRestaurantIntent(normalized))) {
    await abandonOpenDraft(supabase, conversation.id);
    await clearConversationRestaurant(supabase, conversation.id, row.message_id);
    await sendRestaurantPicker(supabase, row.from_phone);
    return;
  }

  if (command.kind === "ACTION_ORDERS" || (conversation.state !== "drafting_order" && isRecentOrdersIntent(normalized))) {
    await sendRecentOrders(supabase, row.from_phone, customer.phone);
    await updateConversationState(supabase, conversation.id, "idle", "recent_orders", row.message_id);
    return;
  }

  if (command.kind === "DRAFT_CANCEL") {
    await abandonOpenDraft(supabase, conversation.id);
    await updateConversationState(supabase, conversation.id, "idle", "draft_cancelled", row.message_id);
    await sendWhatsAppInteractiveButtons({
      to: row.from_phone,
      body: "Listo, cancele el pedido en curso. Puedes empezar de nuevo cuando quieras.",
      buttons: [
        { id: "ACTION_ORDER", title: "Nuevo pedido" },
        { id: "ACTION_MENU", title: "Ver menu" },
        { id: "ACTION_ORDERS", title: "Mis pedidos" },
      ],
    });
    return;
  }

  if (command.kind === "DRAFT_RESTART" || isRestartIntent(normalized)) {
    await abandonOpenDraft(supabase, conversation.id);
    await clearConversationRestaurant(supabase, conversation.id, row.message_id);
    await sendRestaurantPicker(supabase, row.from_phone);
    return;
  }

  if (command.kind === "DRAFT_BACK" || (conversation.state === "drafting_order" && isBackIntent(normalized))) {
    if (await goBackInDraft(supabase, row, conversation)) {
      return;
    }
    await sendWhatsAppInteractiveButtons({
      to: row.from_phone,
      body: "Ya estas al inicio de este flujo. Puedes elegir una opcion para continuar.",
      buttons: [
        { id: "ACTION_ORDER", title: "Hacer pedido" },
        { id: "ACTION_CHANGE_RESTAURANT", title: "Cambiar lugar" },
        { id: "DRAFT_RESTART", title: "Empezar de nuevo" },
      ],
    });
    return;
  }

  if (command.kind?.startsWith("CATEGORY_PAGE:")) {
    const restaurant = await findRestaurantById(supabase, conversation.restaurant_id ?? "");
    if (restaurant) {
      await sendCategoryPicker(supabase, row.from_phone, restaurant, Number(command.kind.replace("CATEGORY_PAGE:", "")) || 0);
    }
    return;
  }

  if (command.kind?.startsWith("CATEGORY:")) {
    const restaurant = await findRestaurantById(supabase, conversation.restaurant_id ?? "");
    if (!restaurant) {
      await sendRestaurantPicker(supabase, row.from_phone);
      return;
    }

    await sendProductPicker(supabase, row.from_phone, restaurant, command.kind.replace("CATEGORY:", ""));
    return;
  }

  if (command.kind?.startsWith("PRODUCT_PAGE:")) {
    const restaurant = await findRestaurantById(supabase, conversation.restaurant_id ?? "");
    const [, categoryId, pageValue] = command.kind.split(":");
    if (restaurant && categoryId) {
      await sendProductPicker(supabase, row.from_phone, restaurant, categoryId, Number(pageValue) || 0);
    }
    return;
  }

  if (command.kind?.startsWith("PRODUCT:")) {
    const restaurant = await findRestaurantById(supabase, conversation.restaurant_id ?? "");
    const productId = command.kind.replace("PRODUCT:", "");

    if (!restaurant) {
      await updateConversationState(supabase, conversation.id, "choosing_restaurant", "missing_restaurant", row.message_id);
      await sendRestaurantPicker(supabase, row.from_phone);
      return;
    }

    await beginProductConfiguration(supabase, row, conversation, customer, restaurant, productId);
    return;
  }

  if (command.kind?.startsWith("PRODUCT_QTY:")) {
    const restaurant = await findRestaurantById(supabase, conversation.restaurant_id ?? "");
    const [, quantityValue, productId] = command.kind.split(":");

    if (!restaurant || !productId) {
      await sendRestaurantPicker(supabase, row.from_phone);
      return;
    }

    await beginProductConfiguration(supabase, row, conversation, customer, restaurant, productId, normalizeQuantity(Number(quantityValue)));
    return;
  }

  if (command.kind?.startsWith("VARIANT:")) {
    await selectPendingVariant(supabase, row, conversation, command.kind.replace("VARIANT:", ""));
    return;
  }

  if (command.kind?.startsWith("OPTION:")) {
    await selectPendingOption(supabase, row, conversation, command.kind.replace("OPTION:", ""));
    return;
  }

  if (command.kind === "OPTION_DONE" || command.kind === "OPTION_SKIP") {
    await finishPendingOptionGroup(supabase, row, conversation, command.kind === "OPTION_SKIP");
    return;
  }

  if (command.kind === "OPTION_MORE") {
    const draft = await getOpenDraft(supabase, conversation.id);
    if (draft) {
      await continuePendingItemConfiguration(supabase, row.from_phone, conversation, draft, row);
    }
    return;
  }

  if (command.kind?.startsWith("ITEM_QTY:")) {
    await finishPendingItem(supabase, row, conversation, Number(command.kind.replace("ITEM_QTY:", "")));
    return;
  }

  if (command.kind === "DRAFT_ADD_MORE") {
    const restaurant = await findRestaurantById(supabase, conversation.restaurant_id ?? "");
    if (!restaurant) {
      await sendRestaurantPicker(supabase, row.from_phone);
      return;
    }
    await updateOpenDraft(supabase, conversation.id, { checkout_step: "catalog", pending_item: null, status: "open" });
    await updateConversationState(supabase, conversation.id, "drafting_order", "add_more", row.message_id);
    await sendCategoryPicker(supabase, row.from_phone, restaurant);
    return;
  }

  if (command.kind === "DRAFT_CHECKOUT") {
    await beginDraftCheckout(supabase, row, conversation);
    return;
  }

  if (command.kind === "ORDER_TYPE:pickup" || command.kind === "ORDER_TYPE:delivery") {
    const orderType = command.kind.replace("ORDER_TYPE:", "") as "delivery" | "pickup";
    await selectDraftOrderType(supabase, row, conversation, orderType);
    return;
  }

  if (command.kind === "FULFILLMENT:now" || command.kind === "FULFILLMENT:schedule") {
    await selectDraftFulfillmentTime(supabase, row, conversation, command.kind === "FULFILLMENT:schedule");
    return;
  }

  if (command.kind === "INVOICE:YES" || command.kind === "INVOICE:NO") {
    await selectDraftInvoice(supabase, row, conversation, command.kind === "INVOICE:YES");
    return;
  }

  if (command.kind === "PAYMENT:cash" || command.kind === "PAYMENT:qr") {
    await selectDraftPayment(supabase, row, conversation, command.kind === "PAYMENT:qr" ? "qr" : "cash");
    return;
  }

  if (command.kind === "DRAFT_CONFIRM") {
    await confirmDraftOrder(supabase, row, customer, conversation);
    return;
  }

  if (conversation.state === "drafting_order" && isConfirmIntent(normalized)) {
    const draft = await getOpenDraft(supabase, conversation.id);
    if (draft?.checkout_step === "confirmation" && !draft.pending_item) {
      await confirmDraftOrder(supabase, row, customer, conversation);
      return;
    }
  }

  if (conversation.state === "drafting_order") {
    const draft = await getOpenDraft(supabase, conversation.id);
    if (draft && (await consumeDraftInput(supabase, row, conversation, draft))) {
      return;
    }
  }

  if (row.message_type === "text" && conversation.restaurant_id) {
    const draft = conversation.state === "drafting_order" ? await getOpenDraft(supabase, conversation.id) : null;
    const canSearchProduct = !draft || (!draft.pending_item && draft.checkout_step === "catalog");
    if (canSearchProduct) {
      const restaurant = await findRestaurantById(supabase, conversation.restaurant_id);
      if (restaurant && (await tryBeginProductFromText(supabase, row, conversation, customer, restaurant, command.text))) {
        return;
      }
    }
  }

  if (
    conversation.state === "handoff" &&
    !isMenuIntent(normalized) &&
    !isOrderIntent(normalized) &&
    !isChangeRestaurantIntent(normalized) &&
    !isRecentOrdersIntent(normalized)
  ) {
    await updateConversationState(supabase, conversation.id, "handoff", "handoff_message", row.message_id);
    return;
  }

  const selectedRestaurant = await resolveSelectedRestaurant(supabase, conversation, command.text);

  if (selectedRestaurant) {
    if (conversation.restaurant_id && conversation.restaurant_id !== selectedRestaurant.id) {
      await abandonOpenDraft(supabase, conversation.id);
    }
    await setConversationRestaurant(supabase, conversation.id, selectedRestaurant.id, "browsing_menu", "restaurant_selected", row.message_id);
    await sendRestaurantMenuIntro(row.from_phone, selectedRestaurant, await listTopProducts(supabase, selectedRestaurant.id));
    return;
  }

  if (conversation.restaurant_id && (isMenuIntent(normalized) || isOrderIntent(normalized) || isGreetingIntent(normalized))) {
    const restaurant = await findRestaurantById(supabase, conversation.restaurant_id);
    if (restaurant) {
      if (isOrderIntent(normalized)) {
        await ensureOpenDraft(supabase, conversation, customer, restaurant.id);
        await updateConversationState(supabase, conversation.id, "drafting_order", "order", row.message_id);
        await sendCategoryPicker(supabase, row.from_phone, restaurant);
      } else {
        await updateConversationState(supabase, conversation.id, "browsing_menu", detectIntent(normalized), row.message_id);
        await sendRestaurantMenuIntro(row.from_phone, restaurant, await listTopProducts(supabase, restaurant.id));
      }
      return;
    }
  }

  if (isMenuIntent(normalized) || isOrderIntent(normalized) || isGreetingIntent(normalized) || conversation.state === "choosing_restaurant") {
    await updateConversationState(supabase, conversation.id, "choosing_restaurant", detectIntent(normalized), row.message_id);
    await sendRestaurantPicker(supabase, row.from_phone);
    return;
  }

  await updateConversationState(supabase, conversation.id, "idle", "fallback", row.message_id);
  await sendWhatsAppInteractiveButtons({
    to: row.from_phone,
    body: "Hola, soy YoPido.shop. Puedo ayudarte a pedir, ver el menu o revisar tus ultimos pedidos.",
    buttons: [
      { id: "ACTION_MENU", title: "Ver menu" },
      { id: "ACTION_ORDER", title: "Hacer pedido" },
      { id: "ACTION_ORDERS", title: "Mis pedidos" },
    ],
  });
}

async function ensureWhatsAppConversation(supabase: ReturnType<typeof createSupabaseAdminClient>, row: WhatsAppMessageRow) {
  const now = new Date().toISOString();
  const { data: customer, error: customerError } = await supabase
    .from("whatsapp_customers")
    .upsert(
      {
        phone: row.from_phone,
        display_name: row.contact_name,
        last_seen_at: now,
      },
      { onConflict: "phone" },
    )
    .select("id,phone")
    .single();

  if (customerError || !customer) {
    console.error("Could not upsert WhatsApp customer", customerError);
    throw new Error("whatsapp_customer_failed");
  }

  const { data: existingConversation, error: readError } = await supabase
    .from("whatsapp_conversations")
    .select("id,customer_id,from_phone,restaurant_id,state")
    .eq("from_phone", row.from_phone)
    .maybeSingle();

  if (readError) {
    console.error("Could not read WhatsApp conversation", readError);
    throw new Error("whatsapp_conversation_read_failed");
  }

  if (existingConversation) {
    const { data: updatedConversation, error: updateError } = await supabase
      .from("whatsapp_conversations")
      .update({
        customer_id: customer.id,
        last_message_id: row.message_id,
        last_message_at: row.whatsapp_timestamp ?? now,
      })
      .eq("id", existingConversation.id)
      .select("id,customer_id,from_phone,restaurant_id,state")
      .single();

    if (updateError || !updatedConversation) {
      console.error("Could not update WhatsApp conversation", updateError);
      throw new Error("whatsapp_conversation_update_failed");
    }

    return {
      customer: customer as WhatsAppCustomerRow,
      conversation: updatedConversation as WhatsAppConversationRow,
    };
  }

  const { data: conversation, error: insertError } = await supabase
    .from("whatsapp_conversations")
    .insert({
      customer_id: customer.id,
      from_phone: row.from_phone,
      state: "idle",
      last_message_id: row.message_id,
      last_message_at: row.whatsapp_timestamp ?? now,
    })
    .select("id,customer_id,from_phone,restaurant_id,state")
    .single();

  if (insertError || !conversation) {
    console.error("Could not create WhatsApp conversation", insertError);
    throw new Error("whatsapp_conversation_insert_failed");
  }

  return {
    customer: customer as WhatsAppCustomerRow,
    conversation: conversation as WhatsAppConversationRow,
  };
}

function extractCommand(row: WhatsAppMessageRow) {
  const message = objectValue(row.payload.message);

  if (row.message_type === "interactive") {
    const interactive = objectValue(message.interactive);
    const buttonReply = objectValue(interactive.button_reply);
    const listReply = objectValue(interactive.list_reply);
    const id = stringValue(buttonReply.id) ?? stringValue(listReply.id);
    const title = stringValue(buttonReply.title) ?? stringValue(listReply.title) ?? row.message_text ?? "";

    if (id?.startsWith("RESTAURANT:")) {
      return { kind: "restaurant_select", text: title, value: id.replace("RESTAURANT:", "") };
    }

    return { kind: id ?? "interactive", text: title, value: id };
  }

  if (row.message_type === "button") {
    const button = objectValue(message.button);
    const payload = stringValue(button.payload);
    return { kind: payload ?? "button", text: stringValue(button.text) ?? row.message_text ?? "", value: payload };
  }

  return { kind: "text", text: row.message_text ?? "", value: null };
}

async function resolveSelectedRestaurant(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  conversation: WhatsAppConversationRow,
  text: string,
) {
  if (!text.trim()) {
    return conversation.restaurant_id ? findRestaurantById(supabase, conversation.restaurant_id) : null;
  }

  const restaurants = await listActiveRestaurants(supabase);
  if (restaurants.length === 1) {
    return restaurants[0];
  }

  const normalizedText = normalizeForMatch(text);
  if (!normalizedText || isMenuIntent(normalizedText) || isOrderIntent(normalizedText) || isGreetingIntent(normalizedText)) {
    return null;
  }

  return (
    restaurants.find((restaurant) => normalizeForMatch(restaurant.name) === normalizedText) ??
    restaurants.find((restaurant) => normalizeForMatch(restaurant.name).includes(normalizedText) || normalizedText.includes(normalizeForMatch(restaurant.name))) ??
    null
  );
}

async function listActiveRestaurants(supabase: ReturnType<typeof createSupabaseAdminClient>) {
  const { data, error } = await supabase
    .from("restaurants")
    .select("id,name,slug,city,public_category,address,latitude,longitude")
    .eq("status", "active")
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .limit(100);

  if (error) {
    console.error("Could not list WhatsApp restaurants", error);
    return [];
  }

  return (data ?? []) as RestaurantRow[];
}

async function findRestaurantById(supabase: ReturnType<typeof createSupabaseAdminClient>, restaurantId: string) {
  if (!restaurantId) {
    return null;
  }

  const { data, error } = await supabase
    .from("restaurants")
    .select("id,name,slug,city,public_category,address,latitude,longitude")
    .eq("id", restaurantId)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("Could not find WhatsApp restaurant", error);
    return null;
  }

  return data as RestaurantRow | null;
}

async function listTopProducts(supabase: ReturnType<typeof createSupabaseAdminClient>, restaurantId: string) {
  const { data, error } = await supabase
    .from("products")
    .select("id,name,price,category_id,description,image_url,is_featured,product_kind,available_from,available_until,available_days,available_start_time,available_end_time")
    .eq("restaurant_id", restaurantId)
    .eq("is_available", true)
    .order("is_featured", { ascending: false })
    .order("product_kind", { ascending: true })
    .order("order_count", { ascending: false, nullsFirst: false })
    .order("sort_order", { ascending: true })
    .limit(5);

  if (error) {
    console.error("Could not list WhatsApp menu products", error);
    return [];
  }

  return ((data ?? []) as ProductSummaryRow[]).filter((product) => isProductCurrentlyOrderable(product));
}

async function listCategories(supabase: ReturnType<typeof createSupabaseAdminClient>, restaurantId: string) {
  const { data, error } = await supabase
    .from("categories")
    .select("id,name")
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .limit(50);

  if (error) {
    console.error("Could not list WhatsApp categories", error);
    return [];
  }

  return (data ?? []) as CategoryRow[];
}

async function listProducts(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  restaurantId: string,
  categoryId?: string,
) {
  let query = supabase
    .from("products")
    .select("id,name,price,category_id,description,image_url,is_featured,product_kind,available_from,available_until,available_days,available_start_time,available_end_time")
    .eq("restaurant_id", restaurantId)
    .eq("is_available", true)
    .order("sort_order", { ascending: true })
    .limit(50);

  if (categoryId && categoryId !== "all") {
    query = query.eq("category_id", categoryId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Could not list WhatsApp products", error);
    return [];
  }

  return ((data ?? []) as ProductSummaryRow[]).filter((product) => isProductCurrentlyOrderable(product));
}

async function tryBeginProductFromText(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  row: WhatsAppMessageRow,
  conversation: WhatsAppConversationRow,
  customer: WhatsAppCustomerRow,
  restaurant: RestaurantRow,
  text: string,
) {
  const match = await resolveProductFromText(supabase, restaurant.id, text);
  if (!match.product && match.candidates.length === 0) {
    return false;
  }

  await ensureOpenDraft(supabase, conversation, customer, restaurant.id);
  await updateConversationState(supabase, conversation.id, "drafting_order", "product_search", row.message_id);

  if (!match.product) {
    await sendProductSearchCandidates(row.from_phone, restaurant, match.candidates, match.quantity);
    return true;
  }

  await beginProductConfiguration(supabase, row, conversation, customer, restaurant, match.product.id, match.quantity);
  return true;
}

async function resolveProductFromText(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  restaurantId: string,
  text: string,
): Promise<ProductTextMatch> {
  const request = parseProductSearchInput(text);
  if (!request.query) {
    return { product: null, quantity: request.quantity, candidates: [] };
  }

  const products = await listProducts(supabase, restaurantId, "all");
  const scored = products
    .map((product) => ({ product, score: scoreProductMatch(request.query, product) }))
    .filter((item) => item.score >= 55)
    .sort((left, right) => right.score - left.score || Number(left.product.price) - Number(right.product.price));

  if (scored.length === 0) {
    return { product: null, quantity: request.quantity, candidates: [] };
  }

  const [best, second] = scored;
  const exactEnough = best.score >= 96 || !second || best.score - second.score >= 12;
  if (exactEnough) {
    return { product: best.product, quantity: request.quantity, candidates: [] };
  }

  return {
    product: null,
    quantity: request.quantity,
    candidates: scored.slice(0, 10).map((item) => item.product),
  };
}

async function sendProductSearchCandidates(
  to: string,
  restaurant: RestaurantRow,
  products: ProductSummaryRow[],
  quantity: number | null,
) {
  await sendWhatsAppListMessage({
    to,
    body: `Encontre varias opciones en ${restaurant.name}. Elige cual quieres${quantity ? ` x${quantity}` : ""}.`,
    buttonText: "Elegir producto",
    sectionTitle: "Coincidencias",
    rows: products.map((product) => ({
      id: quantity ? `PRODUCT_QTY:${quantity}:${product.id}` : `PRODUCT:${product.id}`,
      title: truncate(product.name, 24),
      description: truncate(`Bs ${formatMoney(product.price)}${product.description ? ` - ${product.description}` : ""}`, 72),
    })),
  });
}

async function sendRestaurantPicker(supabase: ReturnType<typeof createSupabaseAdminClient>, to: string) {
  const restaurants = await listActiveRestaurants(supabase);

  if (restaurants.length === 0) {
    await sendWhatsAppTextMessage({
      to,
      body: "Todavia no tengo restaurantes activos para mostrarte. Escribenos en unos minutos o revisa https://yopido.shop.",
    });
    return;
  }

  if (restaurants.length === 1) {
    const restaurant = restaurants[0];
    await sendRestaurantMenuIntro(to, restaurant, await listTopProducts(supabase, restaurant.id));
    return;
  }

  await sendWhatsAppListMessage({
    to,
    body:
      restaurants.length > 10
        ? "Elige un restaurante de la lista o escribe su nombre para buscarlo."
        : "Elige el restaurante donde quieres pedir.",
    buttonText: "Ver restaurantes",
    sectionTitle: "Restaurantes",
    rows: restaurants.slice(0, 10).map((restaurant) => ({
      id: `RESTAURANT:${restaurant.id}`,
      title: truncate(restaurant.name, 24),
      description: truncate([restaurant.city, restaurant.public_category].filter(Boolean).join(" - "), 72),
    })),
  });
}

async function sendRestaurantMenuIntro(to: string, restaurant: RestaurantRow, products: ProductSummaryRow[]) {
  const menuUrl = `${getSiteUrl()}/r/${restaurant.slug}?pedido=1`;
  const promoProducts = products.filter((product) => product.product_kind === "promotion" || product.is_featured).slice(0, 3);
  const regularProducts = products.filter((product) => !promoProducts.some((promo) => promo.id === product.id)).slice(0, 3);
  const visibleProducts = promoProducts.length ? promoProducts : regularProducts.length ? regularProducts : products.slice(0, 3);
  const productLines = products.length
    ? visibleProducts.map((product) => `${product.product_kind === "promotion" ? "Promo: " : ""}${product.name}: Bs ${formatMoney(product.price)}`).join("\n")
    : "El menu completo esta disponible en el enlace.";
  const heading = promoProducts.length ? "Promos y favoritos" : "Algunos favoritos";

  await sendWhatsAppInteractiveButtons({
    to,
    body:
      `Estas en ${restaurant.name}.\n\n${heading}:\n${productLines}\n\n` +
      `Puedes escribir directo: 2 hamburguesas, o abrir el menu visual:\n${menuUrl}`,
    buttons: [
      { id: "ACTION_ORDER", title: "Hacer pedido" },
      { id: "ACTION_ORDERS", title: "Mis pedidos" },
      { id: "ACTION_CHANGE_RESTAURANT", title: "Cambiar lugar" },
    ],
  });
}

async function sendRecentOrders(supabase: ReturnType<typeof createSupabaseAdminClient>, to: string, customerPhone: string) {
  const normalizedPhone = normalizeDigits(customerPhone);
  const phoneFilters = phoneLookupVariants(normalizedPhone).map((phone) => `customer_phone_normalized.eq.${phone}`).join(",");
  let query = supabase
    .from("orders")
    .select("order_number,status,payment_status,total,created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  query = phoneFilters ? query.or(phoneFilters) : query.eq("customer_phone_normalized", normalizedPhone);

  const { data, error } = await query;

  if (error) {
    console.error("Could not list WhatsApp recent orders", error);
    await sendWhatsAppTextMessage({ to, body: "No pude revisar tus pedidos ahora. Intenta nuevamente en unos minutos." });
    return;
  }

  const orders = (data ?? []) as RecentOrderRow[];
  if (orders.length === 0) {
    await sendWhatsAppTextMessage({
      to,
      body: "Todavia no encuentro pedidos asociados a este numero. Si quieres empezar uno, escribe: menu.",
    });
    return;
  }

  await sendWhatsAppTextMessage({
    to,
    body: `Tus ultimos pedidos:\n${orders.map(formatRecentOrder).join("\n")}`,
  });
}

async function sendCategoryPicker(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  to: string,
  restaurant: RestaurantRow,
  page = 0,
) {
  const categories = await listCategories(supabase, restaurant.id);

  if (categories.length === 0) {
    await sendProductPicker(supabase, to, restaurant, "all");
    return;
  }

  const pageSize = 8;
  const safePage = Math.max(0, Math.min(Math.floor(page), Math.max(0, Math.ceil(categories.length / pageSize) - 1)));
  const pageCategories = categories.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const rows = [
    ...(safePage === 0 ? [{ id: "CATEGORY:all", title: "Ver todo", description: "Todos los productos disponibles" }] : []),
    ...pageCategories.map((category) => ({
      id: `CATEGORY:${category.id}`,
      title: truncate(category.name, 24),
      description: "Ver productos",
    })),
    ...(safePage > 0 ? [{ id: `CATEGORY_PAGE:${safePage - 1}`, title: "Pagina anterior", description: "Volver a otras categorias" }] : []),
    ...(safePage * pageSize + pageSize < categories.length
      ? [{ id: `CATEGORY_PAGE:${safePage + 1}`, title: "Mas categorias", description: "Ver la siguiente pagina" }]
      : []),
  ];

  await sendWhatsAppListMessage({
    to,
    body: `Que te gustaria pedir de ${restaurant.name}? Puedes elegir de la lista o escribir algo como: 2 hamburguesas.`,
    buttonText: "Ver categorias",
    sectionTitle: "Menu",
    rows,
  });
}

async function sendProductPicker(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  to: string,
  restaurant: RestaurantRow,
  categoryId = "all",
  page = 0,
) {
  const products = await listProducts(supabase, restaurant.id, categoryId);

  if (products.length === 0) {
    await sendWhatsAppTextMessage({
      to,
      body: `No encontre productos disponibles en esta seccion. Puedes volver a escribir menu o abrir ${getSiteUrl()}/r/${restaurant.slug}?pedido=1`,
    });
    return;
  }

  const pageSize = 8;
  const safePage = Math.max(0, Math.min(Math.floor(page), Math.max(0, Math.ceil(products.length / pageSize) - 1)));
  const pageProducts = products.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const rows = [
    ...pageProducts.map((product) => ({
      id: `PRODUCT:${product.id}`,
      title: truncate(product.name, 24),
      description: truncate(`Bs ${formatMoney(product.price)}${product.description ? ` - ${product.description}` : ""}`, 72),
    })),
    ...(safePage > 0
      ? [{ id: `PRODUCT_PAGE:${categoryId}:${safePage - 1}`, title: "Pagina anterior", description: "Volver a otros productos" }]
      : []),
    ...(safePage * pageSize + pageSize < products.length
      ? [{ id: `PRODUCT_PAGE:${categoryId}:${safePage + 1}`, title: "Mas productos", description: "Ver la siguiente pagina" }]
      : []),
  ];

  await sendWhatsAppListMessage({
    to,
    body:
      products.length > pageSize
        ? `Elige un producto de ${restaurant.name}. Tambien puedes escribir cantidad + producto, por ejemplo: 2 pizzas.`
        : `Elige un producto de ${restaurant.name} o escribe cantidad + producto, por ejemplo: 2 pizzas.`,
    buttonText: "Ver productos",
    sectionTitle: "Productos",
    rows,
  });
}

async function ensureOpenDraft(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  conversation: WhatsAppConversationRow,
  customer: WhatsAppCustomerRow,
  restaurantId: string,
) {
  const existing = await getOpenDraft(supabase, conversation.id);
  const usesCurrentItemContract = existing?.items.every((item) => !item.cart_id.startsWith("legacy-")) ?? true;
  if (existing?.restaurant_id === restaurantId && usesCurrentItemContract) {
    return existing;
  }
  if (existing) {
    await supabase.from("whatsapp_order_drafts").update({ status: "abandoned" }).eq("id", existing.id);
  }

  const { data, error } = await supabase
    .from("whatsapp_order_drafts")
    .insert({
      conversation_id: conversation.id,
      customer_id: customer.id,
      restaurant_id: restaurantId,
      status: "open",
      items: [],
    })
    .select(DRAFT_SELECT)
    .single();

  if (error || !data) {
    console.error("Could not create WhatsApp order draft", error);
    throw new Error("whatsapp_draft_create_failed");
  }

  return normalizeDraft(data);
}

async function getOpenDraft(supabase: ReturnType<typeof createSupabaseAdminClient>, conversationId: string) {
  const { data, error } = await supabase
    .from("whatsapp_order_drafts")
    .select(DRAFT_SELECT)
    .eq("conversation_id", conversationId)
    .in("status", ["open", "ready_to_confirm"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Could not read WhatsApp order draft", error);
    return null;
  }

  return data ? normalizeDraft(data) : null;
}

async function updateOpenDraft(supabase: ReturnType<typeof createSupabaseAdminClient>, conversationId: string, patch: JsonObject) {
  const draft = await getOpenDraft(supabase, conversationId);
  if (!draft) {
    throw new Error("whatsapp_draft_missing");
  }

  const { data, error } = await supabase
    .from("whatsapp_order_drafts")
    .update(patch)
    .eq("id", draft.id)
    .select(DRAFT_SELECT)
    .single();

  if (error || !data) {
    console.error("Could not update WhatsApp order draft", error);
    throw new Error("whatsapp_draft_update_failed");
  }

  return normalizeDraft(data);
}

async function getProductConfiguration(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  restaurantId: string,
  productId: string,
) {
  const [productResult, variantsResult, groupsResult, optionsResult] = await Promise.all([
    supabase
      .from("products")
      .select("id,name,price,category_id,description,image_url,is_featured,product_kind,available_from,available_until,available_days,available_start_time,available_end_time")
      .eq("restaurant_id", restaurantId)
      .eq("id", productId)
      .eq("is_available", true)
      .maybeSingle(),
    supabase
      .from("product_variants")
      .select("id,product_id,name,price_delta,is_active")
      .eq("restaurant_id", restaurantId)
      .eq("product_id", productId)
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("product_option_groups")
      .select("id,product_id,name,min_choices,max_choices,is_required,is_active")
      .eq("restaurant_id", restaurantId)
      .eq("product_id", productId)
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("product_options")
      .select("id,product_id,option_group_id,name,price_delta,is_active")
      .eq("restaurant_id", restaurantId)
      .eq("product_id", productId)
      .eq("is_active", true)
      .order("sort_order"),
  ]);

  const product = productResult.data as ProductSummaryRow | null;
  if (productResult.error || !product || !isProductCurrentlyOrderable(product)) {
    return null;
  }

  return {
    product,
    variants: (variantsResult.data ?? []) as ProductVariantRow[],
    groups: (groupsResult.data ?? []) as ProductOptionGroupRow[],
    options: (optionsResult.data ?? []) as ProductOptionRow[],
  };
}

async function beginProductConfiguration(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  row: WhatsAppMessageRow,
  conversation: WhatsAppConversationRow,
  customer: WhatsAppCustomerRow,
  restaurant: RestaurantRow,
  productId: string,
  initialQuantity: number | null = null,
) {
  const configuration = await getProductConfiguration(supabase, restaurant.id, productId);
  if (!configuration) {
    await sendWhatsAppTextMessage({
      to: row.from_phone,
      body: "Ese producto ya no esta disponible. Te muestro el menu actualizado.",
    });
    await sendCategoryPicker(supabase, row.from_phone, restaurant);
    return;
  }

  await ensureOpenDraft(supabase, conversation, customer, restaurant.id);
  const pendingItem: PendingDraftItem = {
    product_id: configuration.product.id,
    product_name: configuration.product.name,
    base_price: Number(configuration.product.price),
    variant_id: null,
    variant_name: null,
    option_ids: [],
    option_names: [],
    group_index: 0,
    quantity: normalizeQuantity(initialQuantity),
  };
  const draft = await updateOpenDraft(supabase, conversation.id, {
    restaurant_id: restaurant.id,
    status: "open",
    checkout_step: configuration.variants.length ? "variant" : configuration.groups.length ? "option" : "quantity",
    pending_item: pendingItem,
  });
  await updateConversationState(supabase, conversation.id, "drafting_order", "configuring_product", row.message_id);
  await sendProductImagePreview(row.from_phone, configuration.product);
  await continuePendingItemConfiguration(supabase, row.from_phone, conversation, draft, row);
}

async function continuePendingItemConfiguration(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  to: string,
  conversation: WhatsAppConversationRow,
  draft: WhatsAppOrderDraftRow,
  row?: WhatsAppMessageRow,
) {
  const pending = draft.pending_item;
  if (!pending || !draft.restaurant_id) {
    return;
  }

  const configuration = await getProductConfiguration(supabase, draft.restaurant_id, pending.product_id);
  if (!configuration) {
    await updateOpenDraft(supabase, conversation.id, { pending_item: null, checkout_step: "catalog" });
    await sendWhatsAppTextMessage({ to, body: "Ese producto dejo de estar disponible. Elige otro del menu." });
    const restaurant = await findRestaurantById(supabase, draft.restaurant_id);
    if (restaurant) {
      await sendCategoryPicker(supabase, to, restaurant);
    }
    return;
  }

  if (configuration.variants.length && !pending.variant_id) {
    await updateOpenDraft(supabase, conversation.id, { checkout_step: "variant" });
    for (let index = 0; index < configuration.variants.length; index += 10) {
      const page = Math.floor(index / 10) + 1;
      const pages = Math.ceil(configuration.variants.length / 10);
      await sendWhatsAppListMessage({
        to,
        body: `${pending.product_name}: elige una presentacion${pages > 1 ? ` (pagina ${page}/${pages})` : ""}.`,
        buttonText: "Ver opciones",
        sectionTitle: "Presentaciones",
        rows: configuration.variants.slice(index, index + 10).map((variant) => ({
          id: `VARIANT:${variant.id}`,
          title: truncate(variant.name, 24),
          description: formatPriceDelta(variant.price_delta),
        })),
      });
    }
    return;
  }

  const group = configuration.groups[pending.group_index];
  if (group) {
    const groupOptions = configuration.options.filter((option) => option.option_group_id === group.id);
    if (groupOptions.length === 0) {
      if (group.min_choices > 0) {
        await updateOpenDraft(supabase, conversation.id, { pending_item: null, checkout_step: "catalog" });
        await sendWhatsAppTextMessage({
          to,
          body: `No se puede configurar ${pending.product_name} porque falta una opcion obligatoria. El restaurante debe revisar ese producto.`,
        });
        return;
      }
      const updated = await updateOpenDraft(supabase, conversation.id, {
        pending_item: { ...pending, group_index: pending.group_index + 1 },
      });
      await continuePendingItemConfiguration(supabase, to, conversation, updated, row);
      return;
    }
    const selectedCount = groupOptions.filter((option) => pending.option_ids.includes(option.id)).length;
    await updateOpenDraft(supabase, conversation.id, { checkout_step: "option" });
    for (let index = 0; index < groupOptions.length; index += 10) {
      const page = Math.floor(index / 10) + 1;
      const pages = Math.ceil(groupOptions.length / 10);
      await sendWhatsAppListMessage({
        to,
        body: `${pending.product_name}\n${group.name}: elige ${group.min_choices === group.max_choices ? group.min_choices : `entre ${group.min_choices} y ${group.max_choices}`}${pages > 1 ? ` (pagina ${page}/${pages})` : ""}.`,
        buttonText: "Elegir extras",
        sectionTitle: truncate(group.name, 24),
        rows: groupOptions.slice(index, index + 10).map((option) => ({
          id: `OPTION:${option.id}`,
          title: truncate(`${pending.option_ids.includes(option.id) ? "[x] " : ""}${option.name}`, 24),
          description: formatPriceDelta(option.price_delta),
        })),
      });
    }
    await sendWhatsAppInteractiveButtons({
      to,
      body: selectedCount
        ? `Seleccionaste ${selectedCount} de ${group.max_choices}. Puedes agregar otra o continuar.`
        : group.min_choices > 0
          ? "Selecciona al menos una opcion de la lista."
          : "Este grupo es opcional. Puedes elegir algo u omitirlo.",
      buttons: [
        { id: "OPTION_DONE", title: "Continuar" },
        ...(group.min_choices === 0 ? [{ id: "OPTION_SKIP", title: "Omitir" }] : []),
        { id: "DRAFT_CANCEL", title: "Cancelar" },
      ],
    });
    return;
  }

  await updateOpenDraft(supabase, conversation.id, { checkout_step: "quantity" });
  if (pending.quantity && row) {
    await finishPendingItem(supabase, row, conversation, pending.quantity);
    return;
  }

  await sendWhatsAppInteractiveButtons({
    to,
    body: `Cuantas unidades de ${pending.product_name} quieres? Tambien puedes escribir una cantidad del 1 al 50.`,
    buttons: [
      { id: "ITEM_QTY:1", title: "1" },
      { id: "ITEM_QTY:2", title: "2" },
      { id: "ITEM_QTY:3", title: "3" },
    ],
  });
}

async function selectPendingVariant(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  row: WhatsAppMessageRow,
  conversation: WhatsAppConversationRow,
  variantId: string,
) {
  const draft = await getOpenDraft(supabase, conversation.id);
  const pending = draft?.pending_item;
  if (!draft || !pending || !draft.restaurant_id) {
    return;
  }

  const configuration = await getProductConfiguration(supabase, draft.restaurant_id, pending.product_id);
  const variant = configuration?.variants.find((item) => item.id === variantId);
  if (!configuration || !variant) {
    await sendWhatsAppTextMessage({ to: row.from_phone, body: "Esa presentacion ya no esta disponible. Elige otra." });
    await continuePendingItemConfiguration(supabase, row.from_phone, conversation, draft, row);
    return;
  }

  const updated = await updateOpenDraft(supabase, conversation.id, {
    checkout_step: configuration.groups.length ? "option" : "quantity",
    pending_item: { ...pending, variant_id: variant.id, variant_name: variant.name },
  });
  await continuePendingItemConfiguration(supabase, row.from_phone, conversation, updated, row);
}

async function selectPendingOption(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  row: WhatsAppMessageRow,
  conversation: WhatsAppConversationRow,
  optionId: string,
) {
  const draft = await getOpenDraft(supabase, conversation.id);
  const pending = draft?.pending_item;
  if (!draft || !pending || !draft.restaurant_id) {
    return;
  }

  const configuration = await getProductConfiguration(supabase, draft.restaurant_id, pending.product_id);
  const group = configuration?.groups[pending.group_index];
  const option = configuration?.options.find((item) => item.id === optionId && item.option_group_id === group?.id);
  if (!configuration || !group || !option) {
    await sendWhatsAppTextMessage({ to: row.from_phone, body: "Esa opcion ya no esta disponible. Revisa la lista actualizada." });
    await continuePendingItemConfiguration(supabase, row.from_phone, conversation, draft, row);
    return;
  }

  const groupOptionIds = new Set(configuration.options.filter((item) => item.option_group_id === group.id).map((item) => item.id));
  const outsideGroup = pending.option_ids.filter((id) => !groupOptionIds.has(id));
  const selectedInGroup = pending.option_ids.filter((id) => groupOptionIds.has(id) && id !== option.id);
  const wasSelected = pending.option_ids.includes(option.id);
  let nextGroupOptions = wasSelected ? selectedInGroup : [...selectedInGroup, option.id];
  if (group.max_choices === 1 && !wasSelected) {
    nextGroupOptions = [option.id];
  }

  if (nextGroupOptions.length > group.max_choices) {
    await sendWhatsAppTextMessage({ to: row.from_phone, body: `Puedes elegir hasta ${group.max_choices} en ${group.name}.` });
    return;
  }

  const shouldAdvance = group.max_choices === 1 && nextGroupOptions.length === 1;
  const nextPending: PendingDraftItem = {
    ...pending,
    option_ids: [...outsideGroup, ...nextGroupOptions],
    option_names: configuration.options
      .filter((item) => [...outsideGroup, ...nextGroupOptions].includes(item.id))
      .map((item) => item.name),
    group_index: shouldAdvance ? pending.group_index + 1 : pending.group_index,
  };
  const updated = await updateOpenDraft(supabase, conversation.id, { pending_item: nextPending });
  await continuePendingItemConfiguration(supabase, row.from_phone, conversation, updated, row);
}

async function finishPendingOptionGroup(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  row: WhatsAppMessageRow,
  conversation: WhatsAppConversationRow,
  skip: boolean,
) {
  const draft = await getOpenDraft(supabase, conversation.id);
  const pending = draft?.pending_item;
  if (!draft || !pending || !draft.restaurant_id) {
    return;
  }

  const configuration = await getProductConfiguration(supabase, draft.restaurant_id, pending.product_id);
  const group = configuration?.groups[pending.group_index];
  if (!configuration || !group) {
    return;
  }

  const groupOptions = configuration.options.filter((option) => option.option_group_id === group.id);
  const selected = groupOptions.filter((option) => pending.option_ids.includes(option.id));
  if ((!skip && selected.length < group.min_choices) || selected.length > group.max_choices || (skip && group.min_choices > 0)) {
    await sendWhatsAppTextMessage({
      to: row.from_phone,
      body: `Para ${group.name} debes elegir entre ${group.min_choices} y ${group.max_choices}.`,
    });
    await continuePendingItemConfiguration(supabase, row.from_phone, conversation, draft, row);
    return;
  }

  const selectedIds = skip
    ? pending.option_ids.filter((id) => !groupOptions.some((option) => option.id === id))
    : pending.option_ids;
  const updated = await updateOpenDraft(supabase, conversation.id, {
    pending_item: {
      ...pending,
      option_ids: selectedIds,
      option_names: configuration.options.filter((option) => selectedIds.includes(option.id)).map((option) => option.name),
      group_index: pending.group_index + 1,
    },
  });
  await continuePendingItemConfiguration(supabase, row.from_phone, conversation, updated, row);
}

async function finishPendingItem(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  row: WhatsAppMessageRow,
  conversation: WhatsAppConversationRow,
  quantity: number,
) {
  const safeQuantity = Math.floor(quantity);
  const draft = await getOpenDraft(supabase, conversation.id);
  const pending = draft?.pending_item;
  if (!draft || !pending || !draft.restaurant_id) {
    return;
  }

  if (!Number.isFinite(quantity) || safeQuantity < 1 || safeQuantity > 50) {
    await sendWhatsAppTextMessage({ to: row.from_phone, body: "Escribe una cantidad entre 1 y 50." });
    return;
  }

  const configuration = await getProductConfiguration(supabase, draft.restaurant_id, pending.product_id);
  if (!configuration) {
    await sendWhatsAppTextMessage({ to: row.from_phone, body: "El producto dejo de estar disponible. Elige otro del menu." });
    return;
  }

  const variant = pending.variant_id ? configuration.variants.find((item) => item.id === pending.variant_id) : null;
  if (configuration.variants.length && !variant) {
    await sendWhatsAppTextMessage({ to: row.from_phone, body: "Falta elegir la presentacion del producto." });
    await continuePendingItemConfiguration(supabase, row.from_phone, conversation, draft, row);
    return;
  }

  const selectedOptions = configuration.options.filter((option) => pending.option_ids.includes(option.id));
  if (!hasValidOptionSelection(configuration.groups, selectedOptions)) {
    await sendWhatsAppTextMessage({ to: row.from_phone, body: "Falta completar una opcion obligatoria del producto." });
    await continuePendingItemConfiguration(supabase, row.from_phone, conversation, draft, row);
    return;
  }

  const unitPrice = roundMoney(
    Number(configuration.product.price) +
      Number(variant?.price_delta ?? 0) +
      selectedOptions.reduce((sum, option) => sum + Number(option.price_delta), 0),
  );
  const optionIds = selectedOptions.map((option) => option.id).sort();
  const signature = [configuration.product.id, variant?.id ?? "", ...optionIds].join(":");
  const item: DraftItem = {
    cart_id: crypto.randomUUID(),
    product_id: configuration.product.id,
    product_name: variant ? `${configuration.product.name} - ${variant.name}` : configuration.product.name,
    variant_id: variant?.id ?? null,
    option_ids: optionIds,
    unit_price: unitPrice,
    quantity: safeQuantity,
    subtotal: roundMoney(unitPrice * safeQuantity),
    notes: [variant?.name, ...selectedOptions.map((option) => option.name)].filter(Boolean).join(", ") || null,
  };
  const items = [...draft.items];
  const existing = items.find(
    (current) => [current.product_id, current.variant_id ?? "", ...[...current.option_ids].sort()].join(":") === signature,
  );
  if (existing) {
    existing.quantity += safeQuantity;
    existing.subtotal = roundMoney(existing.quantity * existing.unit_price);
  } else {
    items.push(item);
  }

  const updated = await updateOpenDraft(supabase, conversation.id, {
    items,
    pending_item: null,
    checkout_step: "catalog",
    status: "open",
  });
  const restaurant = await findRestaurantById(supabase, draft.restaurant_id);
  await updateConversationState(supabase, conversation.id, "drafting_order", "product_added", row.message_id);
  if (restaurant) {
    await sendDraftSummary(row.from_phone, restaurant, updated);
  }
}

async function sendDraftSummary(to: string, restaurant: RestaurantRow, draft: WhatsAppOrderDraftRow) {
  await sendWhatsAppInteractiveButtons({
    to,
    body:
      `Asi va tu pedido en ${restaurant.name}\n\n${formatDraftItems(draft)}\n\nSubtotal: Bs ${formatMoney(draftSubtotal(draft))}\n\n` +
      "Puedes agregar otro producto o continuar para completar entrega y pago.",
    buttons: [
      { id: "DRAFT_ADD_MORE", title: "Agregar producto" },
      { id: "DRAFT_CHECKOUT", title: "Continuar pedido" },
      { id: "DRAFT_RESTART", title: "Empezar de nuevo" },
    ],
  });
}

async function beginDraftCheckout(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  row: WhatsAppMessageRow,
  conversation: WhatsAppConversationRow,
) {
  const draft = await getOpenDraft(supabase, conversation.id);
  if (!draft || !draft.restaurant_id || draft.items.length === 0) {
    await sendWhatsAppTextMessage({ to: row.from_phone, body: "Primero agrega al menos un producto al pedido." });
    return;
  }

  const settings = await getRestaurantSettings(supabase, draft.restaurant_id);
  if (!settings || (!settings.pickup_enabled && !settings.delivery_enabled)) {
    await sendWhatsAppTextMessage({ to: row.from_phone, body: "Este restaurante no tiene recojo ni delivery habilitados en este momento." });
    return;
  }

  await updateOpenDraft(supabase, conversation.id, {
    checkout_step: "order_type",
    status: "open",
    payment_method: null,
    payment_receipt_url: null,
    payment_receipt_media_id: null,
  });
  await updateConversationState(supabase, conversation.id, "drafting_order", "awaiting_order_type", row.message_id);
  await sendCheckoutGuide(row.from_phone, settings);
}

function formatCheckoutGuide(settings: RestaurantSettingsRow) {
  const deliveryOptions = [
    ...(settings.pickup_enabled ? ["recojo"] : []),
    ...(settings.delivery_enabled ? ["delivery"] : []),
  ].join(" o ");
  const paymentOptions = settings.qr_payment_url?.trim() ? "efectivo o QR" : "efectivo";
  const lines = [
    "Completemos tu pedido.",
    "",
    "Responde copiando este formato:",
    `🛵 Entrega: ${settings.delivery_enabled ? "delivery" : "recojo"}`,
    "🕒 Hora: ahora",
    "👤 Cliente: Juan Perez",
    "💵 Pago: efectivo",
    ...(settings.invoice_enabled ? ["🧾 Factura: sin factura"] : []),
    "",
    "Ejemplos validos:",
    `Entrega: ${deliveryOptions}`,
    "Hora: ahora, 19:30 o 28/08/2026 19:30",
    `Pago: ${paymentOptions}`,
    ...(settings.invoice_enabled ? ["Factura: sin factura o con factura"] : []),
  ];

  if (settings.delivery_enabled) {
    lines.push("", "Si es delivery agrega:", "📍 Direccion: Av. Siempre Viva 123", "🏠 Referencia: puerta negra");
  }

  return lines.join("\n");
}

async function sendCheckoutGuide(to: string, settings: RestaurantSettingsRow) {
  await sendWhatsAppTextMessage({ to, body: formatCheckoutGuide(settings) });
}

async function selectDraftOrderType(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  row: WhatsAppMessageRow,
  conversation: WhatsAppConversationRow,
  orderType: "delivery" | "pickup",
) {
  const draft = await getOpenDraft(supabase, conversation.id);
  const settings = draft?.restaurant_id ? await getRestaurantSettings(supabase, draft.restaurant_id) : null;
  const enabled = orderType === "delivery" ? settings?.delivery_enabled : settings?.pickup_enabled;
  if (!draft || !enabled) {
    await sendWhatsAppTextMessage({ to: row.from_phone, body: "Esa forma de entrega no esta habilitada. Elige otra opcion." });
    await beginDraftCheckout(supabase, row, conversation);
    return;
  }

  await updateOpenDraft(supabase, conversation.id, {
    order_type: orderType,
    checkout_step: "fulfillment",
    ...(orderType === "pickup"
      ? {
          customer_address: null,
          customer_address_detail: null,
          delivery_latitude: null,
          delivery_longitude: null,
          delivery_maps_url: null,
          delivery_distance_km: null,
          delivery_fee: 0,
          requires_prepayment: false,
        }
      : {}),
  });
  if (settings) {
    await sendCheckoutGuide(row.from_phone, settings);
    return;
  }
  await sendFulfillmentPicker(row.from_phone);
}

async function sendFulfillmentPicker(to: string) {
  await sendWhatsAppTextMessage({
    to,
    body:
      "Completemos tu pedido.\n\n" +
      "Responde copiando este formato:\n" +
      "🕒 Hora: ahora\n" +
      "👤 Cliente: Juan Perez\n" +
      "💵 Pago: efectivo",
  });
}

async function selectDraftFulfillmentTime(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  row: WhatsAppMessageRow,
  conversation: WhatsAppConversationRow,
  schedule: boolean,
) {
  const draft = await getOpenDraft(supabase, conversation.id);
  if (!draft?.restaurant_id) {
    return;
  }

  if (schedule) {
    await updateOpenDraft(supabase, conversation.id, { checkout_step: "schedule", requested_fulfillment_at: null });
    await sendWhatsAppInteractiveButtons({
      to: row.from_phone,
      body: "Escribe la fecha y hora en formato DD/MM/AAAA HH:MM. Ejemplo: 28/08/2026 19:30.",
      buttons: [
        { id: "FULFILLMENT:now", title: "Lo antes posible" },
        { id: "DRAFT_BACK", title: "Volver" },
        { id: "DRAFT_RESTART", title: "Empezar de nuevo" },
      ],
    });
    return;
  }

  const [hours, hasCash] = await Promise.all([
    listBusinessHours(supabase, draft.restaurant_id),
    hasOpenCashSession(supabase, draft.restaurant_id),
  ]);
  if (!isLocalDateTimeWithinBusinessHours(formatLocalDateTimeInput(new Date()), hours) || !hasCash) {
    await updateOpenDraft(supabase, conversation.id, { checkout_step: "schedule", requested_fulfillment_at: null });
    await sendWhatsAppInteractiveButtons({
      to: row.from_phone,
      body: !hasCash
        ? "La caja del restaurante aun no esta abierta para pedidos inmediatos. Puedes programarlo escribiendo DD/MM/AAAA HH:MM."
        : "El restaurante esta fuera de horario ahora. Puedes programar el pedido escribiendo DD/MM/AAAA HH:MM.",
      buttons: [
        { id: "DRAFT_BACK", title: "Volver" },
        { id: "DRAFT_ADD_MORE", title: "Agregar producto" },
        { id: "DRAFT_RESTART", title: "Empezar de nuevo" },
      ],
    });
    return;
  }

  const updated = await updateOpenDraft(supabase, conversation.id, { requested_fulfillment_at: null });
  await continueAfterFulfillmentTime(supabase, row, conversation, updated);
}

async function continueAfterFulfillmentTime(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  row: WhatsAppMessageRow,
  conversation: WhatsAppConversationRow,
  draft: WhatsAppOrderDraftRow,
) {
  if (draft.order_type === "delivery") {
    await updateOpenDraft(supabase, conversation.id, { checkout_step: "location" });
    await sendWhatsAppLocationRequest({
      to: row.from_phone,
      body: "Comparte tu ubicacion exacta desde WhatsApp. Asi calculamos delivery, distancia y si corresponde prepago QR.",
    });
    return;
  }

  await askCustomerName(supabase, row.from_phone, conversation.id);
}

async function consumeDraftInput(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  row: WhatsAppMessageRow,
  conversation: WhatsAppConversationRow,
  draft: WhatsAppOrderDraftRow,
) {
  if (draft.checkout_step === "quantity" && row.message_type === "text") {
    const quantity = Number(row.message_text?.trim());
    if (Number.isFinite(quantity)) {
      await finishPendingItem(supabase, row, conversation, quantity);
      return true;
    }
  }

  if (draft.checkout_step === "location") {
    if (row.message_type !== "location") {
      await sendWhatsAppLocationRequest({ to: row.from_phone, body: "Necesito que compartas la ubicacion usando el boton de WhatsApp para calcular el delivery." });
      return true;
    }

    const location = objectValue(objectValue(row.payload.message).location);
    const latitude = Number(location.latitude);
    const longitude = Number(location.longitude);
    if (!hasValidCoordinates(latitude, longitude)) {
      await sendWhatsAppTextMessage({ to: row.from_phone, body: "No pude leer esa ubicacion. Vuelve a compartirla desde WhatsApp." });
      return true;
    }

    const updated = await updateOpenDraft(supabase, conversation.id, {
      checkout_step: draft.customer_address?.trim() ? "name" : "address",
      delivery_latitude: latitude,
      delivery_longitude: longitude,
      delivery_maps_url: coordinatesToMapsUrl(latitude, longitude),
    });
    if (updated.customer_address?.trim()) {
      await continueAfterCompactCheckout(supabase, row, conversation, updated, true);
      return true;
    }
    await sendWhatsAppInteractiveButtons({
      to: row.from_phone,
      body: "Perfecto, ya tengo tu ubicacion. Ahora escribe la direccion: calle, numero y zona o barrio.",
      buttons: [
        { id: "DRAFT_BACK", title: "Volver" },
        { id: "DRAFT_ADD_MORE", title: "Agregar producto" },
        { id: "DRAFT_RESTART", title: "Empezar de nuevo" },
      ],
    });
    return true;
  }

  if (draft.checkout_step === "receipt") {
    if (row.message_type !== "image" && row.message_type !== "document") {
      await sendWhatsAppTextMessage({ to: row.from_phone, body: "Envia una foto, captura o PDF del comprobante QR." });
      return true;
    }

    try {
      const receipt = await storeInboundPaymentReceipt(supabase, row, draft);
      const updated = await updateOpenDraft(supabase, conversation.id, {
        payment_receipt_url: receipt.url,
        payment_receipt_media_id: receipt.mediaId,
      });
      await showDraftConfirmation(supabase, row, conversation, updated);
    } catch (error) {
      console.error("Could not store WhatsApp payment receipt", error);
      await sendWhatsAppTextMessage({
        to: row.from_phone,
        body: "No pude guardar ese comprobante. Envia una imagen JPG, PNG, WebP o un PDF de hasta 5 MB.",
      });
    }
    return true;
  }

  const text = row.message_type === "text" ? row.message_text?.trim() : null;
  if (!text) {
    return false;
  }

  if (await applyCompactCheckoutInput(supabase, row, conversation, draft, text)) {
    return true;
  }

  if (draft.checkout_step === "order_type" || draft.checkout_step === "fulfillment") {
    const settings = draft.restaurant_id ? await getRestaurantSettings(supabase, draft.restaurant_id) : null;
    if (settings) {
      await sendCheckoutGuide(row.from_phone, settings);
    } else {
      await sendFulfillmentPicker(row.from_phone);
    }
    return true;
  }

  if (draft.checkout_step === "schedule") {
    const localInput = parseScheduleInput(text);
    const iso = localInput ? localDateTimeInputToIso(localInput) : null;
    const hours = draft.restaurant_id ? await listBusinessHours(supabase, draft.restaurant_id) : [];
    if (!localInput || !iso || new Date(iso).getTime() <= Date.now() || !isLocalDateTimeWithinBusinessHours(localInput, hours)) {
      await sendWhatsAppTextMessage({
        to: row.from_phone,
        body: "Esa fecha no es valida, ya paso o esta fuera del horario del restaurante. Usa DD/MM/AAAA HH:MM.",
      });
      return true;
    }

    const updated = await updateOpenDraft(supabase, conversation.id, { requested_fulfillment_at: iso });
    await continueAfterFulfillmentTime(supabase, row, conversation, updated);
    return true;
  }

  if (draft.checkout_step === "address") {
    if (text.length < 5 || text.length > 240) {
      await sendWhatsAppTextMessage({ to: row.from_phone, body: "Escribe una direccion un poco mas completa, por ejemplo calle, numero y zona." });
      return true;
    }
    await updateOpenDraft(supabase, conversation.id, { customer_address: text, checkout_step: "address_detail" });
    await sendWhatsAppInteractiveButtons({
      to: row.from_phone,
      body: "Agrega una referencia para el repartidor: piso, puerta, color de casa o indicacion. Si no hace falta, escribe NO.",
      buttons: [
        { id: "DRAFT_BACK", title: "Volver" },
        { id: "DRAFT_ADD_MORE", title: "Agregar producto" },
        { id: "DRAFT_RESTART", title: "Empezar de nuevo" },
      ],
    });
    return true;
  }

  if (draft.checkout_step === "address_detail") {
    await updateOpenDraft(supabase, conversation.id, {
      customer_address_detail: normalizeForMatch(text) === "no" ? null : truncate(text, 180),
    });
    await askCustomerName(supabase, row.from_phone, conversation.id);
    return true;
  }

  if (draft.checkout_step === "name") {
    if (text.length < 2 || text.length > 120) {
      await sendWhatsAppTextMessage({ to: row.from_phone, body: "Escribe el nombre para registrar el pedido." });
      return true;
    }
    const updated = await updateOpenDraft(supabase, conversation.id, { customer_name: text });
    await continueAfterCustomerName(supabase, row, conversation, updated);
    return true;
  }

  if (draft.checkout_step === "invoice_detail") {
    const invoiceFields = parseInvoiceFieldsFromSegments(text.split(/\s*[|;\n]\s*/).filter(Boolean));
    if (!invoiceFields) {
      await sendWhatsAppTextMessage({
        to: row.from_phone,
        body:
          "Envia los datos de factura asi:\n" +
          "🧾 Tipo: CI\n" +
          "🔢 Numero: 1234567\n" +
          "👤 Nombre: Maria Perez",
      });
      return true;
    }
    const updated = await updateOpenDraft(supabase, conversation.id, {
      invoice_document_type: invoiceFields.documentType,
      invoice_document_number: invoiceFields.documentNumber,
      invoice_name: invoiceFields.name,
    });
    await moveDraftToPayment(supabase, row, conversation, updated);
    return true;
  }

  return false;
}

async function applyCompactCheckoutInput(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  row: WhatsAppMessageRow,
  conversation: WhatsAppConversationRow,
  draft: WhatsAppOrderDraftRow,
  text: string,
) {
  if (draft.pending_item || draft.items.length === 0 || draft.checkout_step === "receipt" || draft.checkout_step === "quantity") {
    return false;
  }

  const input = parseCompactCheckoutInput(text, draft);
  if (!input.hasSignal) {
    return false;
  }

  if (!draft.restaurant_id) {
    await sendRestaurantPicker(supabase, row.from_phone);
    return true;
  }

  const settings = await getRestaurantSettings(supabase, draft.restaurant_id);
  if (!settings) {
    await sendWhatsAppTextMessage({ to: row.from_phone, body: "No pude leer la configuracion del restaurante. Intenta nuevamente en unos minutos." });
    return true;
  }

  const enabledOrderTypes: Array<"delivery" | "pickup"> = [
    ...(settings.delivery_enabled ? (["delivery"] as const) : []),
    ...(settings.pickup_enabled ? (["pickup"] as const) : []),
  ];
  const requestedOrderType = input.orderType ?? draft.order_type ?? (enabledOrderTypes.length === 1 ? enabledOrderTypes[0] : null);
  if (input.orderType && !enabledOrderTypes.includes(input.orderType)) {
    await sendWhatsAppTextMessage({ to: row.from_phone, body: "Esa forma de entrega no esta habilitada para este restaurante." });
    await beginDraftCheckout(supabase, row, conversation);
    return true;
  }

  const patch: JsonObject = { status: "open" };
  let fulfillmentResolved = Boolean(input.fulfillment);
  if (requestedOrderType) {
    patch.order_type = requestedOrderType;
    patch.checkout_step = "fulfillment";
    if (requestedOrderType === "pickup") {
      patch.customer_address = null;
      patch.customer_address_detail = null;
      patch.delivery_latitude = null;
      patch.delivery_longitude = null;
      patch.delivery_maps_url = null;
      patch.delivery_distance_km = null;
      patch.delivery_fee = 0;
      patch.requires_prepayment = false;
    }
  }

  if (input.fulfillment === "schedule") {
    if (!input.scheduledLocalInput || !input.scheduledIso) {
      await updateOpenDraft(supabase, conversation.id, { ...patch, checkout_step: "schedule", requested_fulfillment_at: null });
      await sendWhatsAppInteractiveButtons({
        to: row.from_phone,
        body: "Para programarlo escribe fecha y hora en formato DD/MM/AAAA HH:MM. Ejemplo: 28/08/2026 19:30.",
        buttons: [
          { id: "FULFILLMENT:now", title: "Lo antes posible" },
          { id: "DRAFT_BACK", title: "Volver" },
          { id: "DRAFT_RESTART", title: "Empezar de nuevo" },
        ],
      });
      return true;
    }

    const hours = await listBusinessHours(supabase, draft.restaurant_id);
    if (new Date(input.scheduledIso).getTime() <= Date.now() || !isLocalDateTimeWithinBusinessHours(input.scheduledLocalInput, hours)) {
      await sendWhatsAppTextMessage({
        to: row.from_phone,
        body: "Esa fecha no es valida, ya paso o esta fuera del horario del restaurante. Usa DD/MM/AAAA HH:MM.",
      });
      return true;
    }
    patch.requested_fulfillment_at = input.scheduledIso;
  } else if (input.fulfillment === "now") {
    patch.requested_fulfillment_at = null;
    fulfillmentResolved = true;
  } else if (draft.requested_fulfillment_at) {
    fulfillmentResolved = true;
  } else if (input.orderType || input.paymentMethod || input.invoiceRequired !== null || input.customerName) {
    patch.requested_fulfillment_at = null;
    fulfillmentResolved = true;
  }

  if (input.customerName) {
    patch.customer_name = input.customerName;
  }
  if (requestedOrderType === "delivery" && input.customerAddress) {
    patch.customer_address = input.customerAddress;
  }
  if (requestedOrderType === "delivery" && input.customerAddressDetail !== null) {
    patch.customer_address_detail = input.customerAddressDetail;
  }
  if (input.invoiceFields) {
    patch.invoice_required = true;
    patch.invoice_document_type = input.invoiceFields.documentType;
    patch.invoice_document_number = input.invoiceFields.documentNumber;
    patch.invoice_name = input.invoiceFields.name;
  } else if (input.invoiceRequired !== null) {
    patch.invoice_required = input.invoiceRequired;
    patch.invoice_document_type = null;
    patch.invoice_document_number = null;
    patch.invoice_name = null;
  }
  if (input.paymentMethod) {
    patch.payment_method = input.paymentMethod;
    patch.payment_receipt_url = null;
    patch.payment_receipt_media_id = null;
  }

  const updated = await updateOpenDraft(supabase, conversation.id, patch);
  await continueAfterCompactCheckout(supabase, row, conversation, updated, fulfillmentResolved);
  return true;
}

async function continueAfterCompactCheckout(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  row: WhatsAppMessageRow,
  conversation: WhatsAppConversationRow,
  draft: WhatsAppOrderDraftRow,
  fulfillmentResolved: boolean,
) {
  if (!draft.order_type) {
    await beginDraftCheckout(supabase, row, conversation);
    return;
  }

  if (!fulfillmentResolved && !draft.requested_fulfillment_at) {
    await updateOpenDraft(supabase, conversation.id, { checkout_step: "fulfillment" });
    await sendFulfillmentPicker(row.from_phone);
    return;
  }

  if (draft.order_type === "delivery") {
    if (!hasValidCoordinates(draft.delivery_latitude, draft.delivery_longitude)) {
      await updateOpenDraft(supabase, conversation.id, { checkout_step: "location" });
      await sendWhatsAppLocationRequest({
        to: row.from_phone,
        body: "Listo. Ahora comparte tu ubicacion exacta desde WhatsApp para calcular el delivery.",
      });
      return;
    }

    if (!draft.customer_address?.trim()) {
      await updateOpenDraft(supabase, conversation.id, { checkout_step: "address" });
      await sendWhatsAppInteractiveButtons({
        to: row.from_phone,
        body:
          "Ya tengo tu GPS. Completa la direccion asi:\n" +
          "📍 Direccion: Av. Siempre Viva 123\n" +
          "🏠 Referencia: puerta negra",
        buttons: [
          { id: "DRAFT_BACK", title: "Volver" },
          { id: "DRAFT_ADD_MORE", title: "Agregar producto" },
          { id: "DRAFT_RESTART", title: "Empezar de nuevo" },
        ],
      });
      return;
    }
  }

  if (!draft.customer_name?.trim()) {
    await askCustomerName(supabase, row.from_phone, conversation.id);
    return;
  }

  const settings = draft.restaurant_id ? await getRestaurantSettings(supabase, draft.restaurant_id) : null;
  if (settings?.invoice_enabled) {
    if (draft.invoice_required === null) {
      await updateOpenDraft(supabase, conversation.id, { checkout_step: "invoice" });
      await sendWhatsAppInteractiveButtons({
        to: row.from_phone,
        body: "Necesitas factura? Para ir mas rapido tambien puedes escribir: sin factura.",
        buttons: [
          { id: "INVOICE:NO", title: "Sin factura" },
          { id: "INVOICE:YES", title: "Quiero factura" },
          { id: "DRAFT_CANCEL", title: "Cancelar" },
        ],
      });
      return;
    }

    if (draft.invoice_required && (!draft.invoice_document_type || !draft.invoice_document_number || !draft.invoice_name)) {
      await updateOpenDraft(supabase, conversation.id, { checkout_step: "invoice_detail" });
      await sendWhatsAppTextMessage({
        to: row.from_phone,
        body:
          "Envia los datos de factura asi:\n" +
          "🧾 Tipo: NIT\n" +
          "🔢 Numero: 123456789\n" +
          "👤 Nombre: Empresa SRL",
      });
      return;
    }
  }

  if (!draft.payment_method) {
    await moveDraftToPayment(supabase, row, conversation, draft);
    return;
  }

  await selectDraftPayment(supabase, row, conversation, draft.payment_method);
}

async function askCustomerName(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  to: string,
  conversationId: string,
) {
  await updateOpenDraft(supabase, conversationId, { checkout_step: "name" });
  await sendWhatsAppInteractiveButtons({
    to,
    body: "A que nombre registramos el pedido?",
    buttons: [
      { id: "DRAFT_BACK", title: "Volver" },
      { id: "DRAFT_ADD_MORE", title: "Agregar producto" },
      { id: "DRAFT_RESTART", title: "Empezar de nuevo" },
    ],
  });
}

async function goBackInDraft(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  row: WhatsAppMessageRow,
  conversation: WhatsAppConversationRow,
) {
  const draft = await getOpenDraft(supabase, conversation.id);
  const restaurant = await findRestaurantById(supabase, draft?.restaurant_id ?? conversation.restaurant_id ?? "");

  if (!draft || !restaurant) {
    await sendRestaurantPicker(supabase, row.from_phone);
    return true;
  }

  if (draft.pending_item) {
    const updated = await updateOpenDraft(supabase, conversation.id, { pending_item: null, checkout_step: "catalog" });
    await sendDraftSummary(row.from_phone, restaurant, updated);
    return true;
  }

  if (draft.checkout_step === "catalog") {
    await sendDraftSummary(row.from_phone, restaurant, draft);
    return true;
  }

  if (draft.checkout_step === "order_type") {
    await sendDraftSummary(row.from_phone, restaurant, draft);
    return true;
  }

  if (draft.checkout_step === "fulfillment") {
    await beginDraftCheckout(supabase, row, conversation);
    return true;
  }

  if (draft.checkout_step === "schedule") {
    await updateOpenDraft(supabase, conversation.id, { checkout_step: "fulfillment", requested_fulfillment_at: null });
    await selectDraftOrderType(supabase, row, conversation, draft.order_type ?? "delivery");
    return true;
  }

  if (draft.checkout_step === "location") {
    await updateOpenDraft(supabase, conversation.id, { checkout_step: "fulfillment" });
    await selectDraftOrderType(supabase, row, conversation, "delivery");
    return true;
  }

  if (draft.checkout_step === "address") {
    await updateOpenDraft(supabase, conversation.id, {
      checkout_step: "location",
      delivery_latitude: null,
      delivery_longitude: null,
      delivery_maps_url: null,
    });
    await continueAfterFulfillmentTime(supabase, row, conversation, { ...draft, order_type: "delivery" });
    return true;
  }

  if (draft.checkout_step === "address_detail") {
    await updateOpenDraft(supabase, conversation.id, { checkout_step: "address", customer_address: null });
    await sendWhatsAppInteractiveButtons({
      to: row.from_phone,
      body: "Volvimos a la direccion. Escribe calle, numero y zona o barrio.",
      buttons: [
        { id: "DRAFT_BACK", title: "Volver" },
        { id: "DRAFT_ADD_MORE", title: "Agregar producto" },
        { id: "DRAFT_RESTART", title: "Empezar de nuevo" },
      ],
    });
    return true;
  }

  if (draft.checkout_step === "name") {
    if (draft.order_type === "delivery") {
      await updateOpenDraft(supabase, conversation.id, { checkout_step: "address_detail", customer_address_detail: null });
      await sendWhatsAppInteractiveButtons({
        to: row.from_phone,
        body: "Volvimos a la referencia. Escribe una indicacion para el repartidor o NO.",
        buttons: [
          { id: "DRAFT_BACK", title: "Volver" },
          { id: "DRAFT_ADD_MORE", title: "Agregar producto" },
          { id: "DRAFT_RESTART", title: "Empezar de nuevo" },
        ],
      });
      return true;
    }
    await updateOpenDraft(supabase, conversation.id, { checkout_step: "fulfillment", customer_name: null });
    await selectDraftOrderType(supabase, row, conversation, draft.order_type ?? "pickup");
    return true;
  }

  if (draft.checkout_step === "invoice") {
    await askCustomerName(supabase, row.from_phone, conversation.id);
    return true;
  }

  if (draft.checkout_step === "invoice_detail") {
    await updateOpenDraft(supabase, conversation.id, { checkout_step: "invoice", invoice_required: null });
    await continueAfterCustomerName(supabase, row, conversation, { ...draft, invoice_required: null });
    return true;
  }

  if (draft.checkout_step === "payment" || draft.checkout_step === "receipt" || draft.checkout_step === "confirmation") {
    await updateOpenDraft(supabase, conversation.id, {
      checkout_step: "name",
      payment_method: null,
      payment_receipt_url: null,
      payment_receipt_media_id: null,
    });
    await askCustomerName(supabase, row.from_phone, conversation.id);
    return true;
  }

  return false;
}

async function continueAfterCustomerName(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  row: WhatsAppMessageRow,
  conversation: WhatsAppConversationRow,
  draft: WhatsAppOrderDraftRow,
) {
  const settings = draft.restaurant_id ? await getRestaurantSettings(supabase, draft.restaurant_id) : null;
  if (settings?.invoice_enabled) {
    await updateOpenDraft(supabase, conversation.id, { checkout_step: "invoice" });
    await sendWhatsAppInteractiveButtons({
      to: row.from_phone,
      body: "Necesitas factura?",
      buttons: [
        { id: "INVOICE:NO", title: "Sin factura" },
        { id: "INVOICE:YES", title: "Quiero factura" },
        { id: "DRAFT_CANCEL", title: "Cancelar" },
      ],
    });
    return;
  }

  const updated = await updateOpenDraft(supabase, conversation.id, { invoice_required: false });
  await moveDraftToPayment(supabase, row, conversation, updated);
}

async function selectDraftInvoice(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  row: WhatsAppMessageRow,
  conversation: WhatsAppConversationRow,
  required: boolean,
) {
  const updated = await updateOpenDraft(supabase, conversation.id, {
    invoice_required: required,
    invoice_document_type: null,
    invoice_document_number: null,
    invoice_name: null,
    checkout_step: required ? "invoice_detail" : "payment",
  });
  if (required) {
    await sendWhatsAppTextMessage({
      to: row.from_phone,
      body:
        "Envia los datos de factura asi:\n" +
        "🧾 Tipo: NIT\n" +
        "🔢 Numero: 123456789\n" +
        "👤 Nombre: Empresa SRL",
    });
    return;
  }
  await moveDraftToPayment(supabase, row, conversation, updated);
}

async function moveDraftToPayment(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  row: WhatsAppMessageRow,
  conversation: WhatsAppConversationRow,
  suppliedDraft?: WhatsAppOrderDraftRow,
) {
  try {
    const quote = await validateDraftOrder(supabase, suppliedDraft ?? (await getOpenDraft(supabase, conversation.id)), false);
    await updateOpenDraft(supabase, conversation.id, {
      items: quote.items,
      checkout_step: "payment",
      delivery_distance_km: quote.deliveryPolicy?.distanceKm ?? null,
      delivery_fee: quote.deliveryPolicy?.deliveryFee ?? 0,
      requires_prepayment: quote.deliveryPolicy?.requiresQrPrepayment ?? false,
    });

    if (quote.deliveryPolicy?.requiresQrPrepayment) {
      await selectDraftPayment(supabase, row, conversation, "qr");
      return;
    }

    if (!quote.settings.qr_payment_url?.trim()) {
      await selectDraftPayment(supabase, row, conversation, "cash");
      return;
    }

    await sendWhatsAppInteractiveButtons({
      to: row.from_phone,
      body:
        `Resumen antes del pago\nSubtotal: Bs ${formatMoney(quote.subtotal)}\n` +
        `${quote.deliveryPolicy ? `Delivery: Bs ${formatMoney(quote.deliveryPolicy.deliveryFee)}\n` : ""}` +
        `Total: Bs ${formatMoney(quote.total)}\n\nComo quieres pagar?`,
      buttons: [
        { id: "PAYMENT:cash", title: "Efectivo" },
        { id: "PAYMENT:qr", title: "QR" },
        { id: "DRAFT_CANCEL", title: "Cancelar" },
      ],
    });
  } catch (error) {
    await sendDraftValidationError(supabase, row, conversation, error);
  }
}

async function selectDraftPayment(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  row: WhatsAppMessageRow,
  conversation: WhatsAppConversationRow,
  paymentMethod: "cash" | "qr",
) {
  try {
    const quote = await validateDraftOrder(supabase, await getOpenDraft(supabase, conversation.id), false);
    if (quote.deliveryPolicy?.requiresQrPrepayment && paymentMethod !== "qr") {
      await sendWhatsAppTextMessage({
        to: row.from_phone,
        body: `Por la distancia del delivery (${quote.deliveryPolicy.distanceKm.toFixed(1)} km), este pedido requiere prepago por QR.`,
      });
      paymentMethod = "qr";
    }
    if (paymentMethod === "qr" && !quote.settings.qr_payment_url?.trim()) {
      throw new Error("qr-unavailable");
    }

    const updated = await updateOpenDraft(supabase, conversation.id, {
      payment_method: paymentMethod,
      payment_receipt_url: null,
      payment_receipt_media_id: null,
      checkout_step: paymentMethod === "qr" ? "receipt" : "confirmation",
      delivery_distance_km: quote.deliveryPolicy?.distanceKm ?? null,
      delivery_fee: quote.deliveryPolicy?.deliveryFee ?? 0,
      requires_prepayment: quote.deliveryPolicy?.requiresQrPrepayment ?? false,
    });
    if (paymentMethod === "qr") {
      await sendQrPaymentInstructions(row.from_phone, quote.settings.qr_payment_url ?? "", quote.total, quote.restaurant.name);
      return;
    }
    await showDraftConfirmation(supabase, row, conversation, updated);
  } catch (error) {
    await sendDraftValidationError(supabase, row, conversation, error);
  }
}

async function sendQrPaymentInstructions(to: string, qrUrl: string, total: number, restaurantName: string) {
  try {
    await sendWhatsAppImageMessage({ to, imageUrl: qrUrl, caption: `QR de ${restaurantName}\nTotal: Bs ${formatMoney(total)}` });
  } catch {
    await sendWhatsAppTextMessage({
      to,
      body: `Abre el QR de ${restaurantName} aqui:\n${qrUrl}\n\nTotal a pagar: Bs ${formatMoney(total)}`,
      previewUrl: true,
    });
  }
  await sendWhatsAppTextMessage({
    to,
    body: `Paga exactamente Bs ${formatMoney(total)} y luego envia aqui la captura o el PDF del comprobante.`,
  });
}

async function sendProductImagePreview(to: string, product: ProductSummaryRow) {
  const imageUrl = resolvePublicImageUrl(product.image_url);
  if (!imageUrl) {
    return;
  }

  try {
    await sendWhatsAppImageMessage({
      to,
      imageUrl,
      caption: `${product.name}\nBs ${formatMoney(product.price)}${product.description ? `\n${truncate(product.description, 180)}` : ""}`,
    });
  } catch (error) {
    console.warn("Could not send WhatsApp product image", {
      productId: product.id,
      imageUrl,
      error,
    });
  }
}

async function showDraftConfirmation(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  row: WhatsAppMessageRow,
  conversation: WhatsAppConversationRow,
  suppliedDraft?: WhatsAppOrderDraftRow,
) {
  try {
    const quote = await validateDraftOrder(supabase, suppliedDraft ?? (await getOpenDraft(supabase, conversation.id)), true);
    const draft = await updateOpenDraft(supabase, conversation.id, {
      items: quote.items,
      status: "ready_to_confirm",
      checkout_step: "confirmation",
      delivery_distance_km: quote.deliveryPolicy?.distanceKm ?? null,
      delivery_fee: quote.deliveryPolicy?.deliveryFee ?? 0,
      requires_prepayment: quote.deliveryPolicy?.requiresQrPrepayment ?? false,
    });
    await updateConversationState(supabase, conversation.id, "drafting_order", "awaiting_confirmation", row.message_id);
    await sendWhatsAppInteractiveButtons({
      to: row.from_phone,
      body:
        `Revisa tu pedido en ${quote.restaurant.name}\n\n${formatDraftItems(draft)}\n\n` +
        `Entrega: ${formatDraftFulfillment(draft)}\n` +
        `${quote.deliveryPolicy ? `Distancia: ${quote.deliveryPolicy.distanceKm.toFixed(1)} km${quote.deliveryPolicy.zoneName ? `\nZona: ${quote.deliveryPolicy.zoneName}` : ""}\nDelivery: Bs ${formatMoney(quote.deliveryPolicy.deliveryFee)}\n` : ""}` +
        `Pago: ${draft.payment_method === "qr" ? "QR con comprobante" : "Efectivo"}\n` +
        `Subtotal: Bs ${formatMoney(quote.subtotal)}\nTotal: Bs ${formatMoney(quote.total)}\n\n` +
        "Al confirmar entrara al panel del restaurante.",
      buttons: [
        { id: "DRAFT_CONFIRM", title: "Confirmar pedido" },
        { id: "DRAFT_ADD_MORE", title: "Agregar producto" },
        { id: "DRAFT_CANCEL", title: "Cancelar" },
      ],
    });
  } catch (error) {
    await sendDraftValidationError(supabase, row, conversation, error);
  }
}

async function confirmDraftOrder(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  row: WhatsAppMessageRow,
  customer: WhatsAppCustomerRow,
  conversation: WhatsAppConversationRow,
) {
  void customer;
  try {
    const quote = await validateDraftOrder(supabase, await getOpenDraft(supabase, conversation.id), true);
    const draft = quote.draft;
    const orderNumber = `W-${draft.id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
    const paymentReceiptUploadedAt = draft.payment_receipt_url ? new Date().toISOString() : null;
    const { data, error } = await supabase.rpc("create_public_order_transaction", {
      p_request_id: draft.id,
      p_order: {
        restaurant_id: quote.restaurant.id,
        table_id: null,
        order_number: orderNumber,
        customer_name: draft.customer_name,
        customer_phone: row.from_phone,
        customer_email: null,
        customer_address: draft.order_type === "delivery" ? draft.customer_address : null,
        delivery_address_detail: draft.order_type === "delivery" ? draft.customer_address_detail : null,
        delivery_latitude: draft.order_type === "delivery" ? draft.delivery_latitude : null,
        delivery_longitude: draft.order_type === "delivery" ? draft.delivery_longitude : null,
        delivery_maps_url: draft.order_type === "delivery" ? draft.delivery_maps_url : null,
        delivery_distance_km: quote.deliveryPolicy?.distanceKm ?? null,
        requires_prepayment: quote.deliveryPolicy?.requiresQrPrepayment ?? false,
        requested_fulfillment_at: draft.requested_fulfillment_at,
        invoice_required: draft.invoice_required ?? false,
        invoice_document_type: draft.invoice_required ? draft.invoice_document_type : null,
        invoice_document_number: draft.invoice_required ? draft.invoice_document_number : null,
        invoice_name: draft.invoice_required ? draft.invoice_name : null,
        order_type: draft.order_type,
        order_origin: "phone_whatsapp",
        payment_method: draft.payment_method,
        payment_receipt_url: draft.payment_receipt_url,
        payment_receipt_uploaded_at: paymentReceiptUploadedAt,
        subtotal: quote.subtotal,
        delivery_fee: quote.deliveryPolicy?.deliveryFee ?? 0,
        discount_total: 0,
        total: quote.total,
        notes: draft.notes?.trim() || "Pedido recibido por WhatsApp.",
      },
      p_items: quote.items.map((item) => ({
        product_id: item.product_id,
        product_name: item.product_name,
        variant_id: item.variant_id,
        option_ids: item.option_ids,
        unit_price: item.unit_price,
        quantity: item.quantity,
        subtotal: item.subtotal,
        notes: item.notes,
      })),
    });

    if (error) {
      throw error;
    }

    const createdOrder = ((data ?? []) as CreatedOrderRow[])[0];
    if (!createdOrder) {
      throw new Error("order-create-failed");
    }

    await supabase
      .from("whatsapp_order_drafts")
      .update({ status: "converted", created_order_id: createdOrder.id })
      .eq("id", draft.id);
    await updateConversationState(supabase, conversation.id, "idle", "order_created", row.message_id);

    const trackingUrl = `${getSiteUrl()}/r/${quote.restaurant.slug}/pedido/${createdOrder.id}?token=${createdOrder.tracking_token}`;
    await sendWhatsAppTextMessage({
      to: row.from_phone,
      body:
        `Pedido ${orderNumber} enviado a ${quote.restaurant.name}.\n` +
        `Total: Bs ${formatMoney(quote.total)}.\n\n` +
        `Puedes seguir su estado aqui:\n${trackingUrl}`,
      previewUrl: true,
    });
  } catch (error) {
    console.error("Could not create WhatsApp order", error);
    await sendDraftValidationError(supabase, row, conversation, error);
  }
}

async function validateDraftOrder(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  draft: WhatsAppOrderDraftRow | null,
  requirePayment: boolean,
): Promise<ValidatedDraftOrder> {
  if (!draft || !draft.restaurant_id || draft.items.length === 0) {
    throw new Error("empty-order");
  }

  const [restaurant, settings, hours, zones, closed] = await Promise.all([
    findRestaurantById(supabase, draft.restaurant_id),
    getRestaurantSettings(supabase, draft.restaurant_id),
    listBusinessHours(supabase, draft.restaurant_id),
    listDeliveryZones(supabase, draft.restaurant_id),
    hasActiveClosure(supabase, draft.restaurant_id),
  ]);
  if (!restaurant || !settings) {
    throw new Error("restaurant-unavailable");
  }
  if (closed) {
    throw new Error("temporarily-closed");
  }

  const items = await revalidateDraftItems(supabase, draft.restaurant_id, draft.items);
  const subtotal = roundMoney(items.reduce((sum, item) => sum + item.subtotal, 0));
  if (!draft.order_type) {
    throw new Error("order-type-required");
  }
  if ((draft.order_type === "delivery" && !settings.delivery_enabled) || (draft.order_type === "pickup" && !settings.pickup_enabled)) {
    throw new Error("order-type-disabled");
  }
  if (!draft.customer_name?.trim()) {
    throw new Error("customer-name-required");
  }
  if (draft.invoice_required && (!draft.invoice_document_type || !draft.invoice_document_number || !draft.invoice_name)) {
    throw new Error("invoice-required");
  }
  if (draft.invoice_required && !settings.invoice_enabled) {
    throw new Error("invoice-disabled");
  }

  const localFulfillment = draft.requested_fulfillment_at
    ? formatLocalDateTimeInput(new Date(draft.requested_fulfillment_at))
    : formatLocalDateTimeInput(new Date());
  if (!isLocalDateTimeWithinBusinessHours(localFulfillment, hours)) {
    throw new Error("outside-hours");
  }
  if (draft.requested_fulfillment_at && new Date(draft.requested_fulfillment_at).getTime() <= Date.now()) {
    throw new Error("schedule-past");
  }
  if (!draft.requested_fulfillment_at && !(await hasOpenCashSession(supabase, draft.restaurant_id))) {
    throw new Error("no-open-cash");
  }

  let deliveryPolicy: DeliveryPolicy | null = null;
  if (draft.order_type === "delivery") {
    if (
      !draft.customer_address?.trim() ||
      !hasValidCoordinates(draft.delivery_latitude, draft.delivery_longitude)
    ) {
      throw new Error("delivery-location");
    }
    deliveryPolicy = resolveWhatsAppDeliveryPolicy({
      restaurant,
      latitude: Number(draft.delivery_latitude),
      longitude: Number(draft.delivery_longitude),
      zones,
      settings,
      subtotal,
    });
    if (!deliveryPolicy.sameCity) {
      throw new Error("different-city");
    }
  }

  const minimum = deliveryPolicy?.minOrderAmount ?? Number(settings.min_order_amount);
  if (subtotal < minimum) {
    throw new Error(`minimum:${formatMoney(minimum)}`);
  }

  const total = roundMoney(subtotal + (deliveryPolicy?.deliveryFee ?? 0));
  if (requirePayment) {
    if (!draft.payment_method) {
      throw new Error("payment-required");
    }
    if (deliveryPolicy?.requiresQrPrepayment && draft.payment_method !== "qr") {
      throw new Error("qr-required-distance");
    }
    if (draft.payment_method === "qr" && !settings.qr_payment_url?.trim()) {
      throw new Error("qr-unavailable");
    }
    if (draft.payment_method === "qr" && !draft.payment_receipt_url?.trim()) {
      throw new Error("receipt-required");
    }
  }

  return { draft, restaurant, settings, items, subtotal, deliveryPolicy, total };
}

async function revalidateDraftItems(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  restaurantId: string,
  draftItems: DraftItem[],
) {
  const productIds = [...new Set(draftItems.map((item) => item.product_id))];
  const optionIds = [...new Set(draftItems.flatMap((item) => item.option_ids))];
  const [productsResult, variantsResult, groupsResult, optionsResult] = await Promise.all([
    supabase
      .from("products")
      .select("id,name,price,category_id,description,image_url,is_featured,product_kind,available_from,available_until,available_days,available_start_time,available_end_time")
      .eq("restaurant_id", restaurantId)
      .in("id", productIds),
    supabase
      .from("product_variants")
      .select("id,product_id,name,price_delta,is_active")
      .eq("restaurant_id", restaurantId)
      .in("product_id", productIds),
    supabase
      .from("product_option_groups")
      .select("id,product_id,name,min_choices,max_choices,is_required,is_active")
      .eq("restaurant_id", restaurantId)
      .in("product_id", productIds),
    optionIds.length
      ? supabase
          .from("product_options")
          .select("id,product_id,option_group_id,name,price_delta,is_active")
          .eq("restaurant_id", restaurantId)
          .in("id", optionIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (productsResult.error) {
    throw new Error("product-unavailable");
  }

  const products = new Map(((productsResult.data ?? []) as ProductSummaryRow[]).map((product) => [product.id, product]));
  const variants = new Map(((variantsResult.data ?? []) as ProductVariantRow[]).map((variant) => [variant.id, variant]));
  const groups = (groupsResult.data ?? []) as ProductOptionGroupRow[];
  const options = new Map(((optionsResult.data ?? []) as ProductOptionRow[]).map((option) => [option.id, option]));

  return draftItems.map((item) => {
    const product = products.get(item.product_id);
    if (!product || !isProductCurrentlyOrderable(product) || item.quantity < 1 || item.quantity > 50) {
      throw new Error("product-unavailable");
    }

    const productVariants = [...variants.values()].filter((variant) => variant.product_id === product.id && variant.is_active);
    const variant = item.variant_id ? variants.get(item.variant_id) : null;
    if ((productVariants.length && !variant) || (variant && (!variant.is_active || variant.product_id !== product.id))) {
      throw new Error("product-configuration");
    }

    const selectedOptions = item.option_ids.map((id) => options.get(id));
    if (selectedOptions.some((option) => !option?.is_active || option.product_id !== product.id)) {
      throw new Error("product-configuration");
    }
    const selected = selectedOptions.filter((option): option is ProductOptionRow => Boolean(option));
    const productGroups = groups.filter((group) => group.product_id === product.id && group.is_active);
    if (!hasValidOptionSelection(productGroups, selected)) {
      throw new Error("product-configuration");
    }

    const unitPrice = roundMoney(
      Number(product.price) +
        Number(variant?.price_delta ?? 0) +
        selected.reduce((sum, option) => sum + Number(option.price_delta), 0),
    );
    return {
      ...item,
      product_name: variant ? `${product.name} - ${variant.name}` : product.name,
      variant_id: variant?.id ?? null,
      option_ids: selected.map((option) => option.id),
      unit_price: unitPrice,
      subtotal: roundMoney(unitPrice * item.quantity),
      notes: [variant?.name, ...selected.map((option) => option.name)].filter(Boolean).join(", ") || null,
    } satisfies DraftItem;
  });
}

function hasValidOptionSelection(groups: ProductOptionGroupRow[], selectedOptions: ProductOptionRow[]) {
  return groups.every((group) => {
    const count = selectedOptions.filter((option) => option.option_group_id === group.id).length;
    return count >= group.min_choices && count <= group.max_choices && (!group.is_required || count > 0);
  });
}

async function getRestaurantSettings(supabase: ReturnType<typeof createSupabaseAdminClient>, restaurantId: string) {
  const { data, error } = await supabase
    .from("restaurant_settings")
    .select(
      "delivery_enabled,pickup_enabled,delivery_fee,delivery_qr_prepayment_enabled,far_delivery_distance_km,free_delivery_from,min_order_amount,currency,invoice_enabled,qr_payment_url",
    )
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (error) {
    console.error("Could not read WhatsApp restaurant settings", error);
    return null;
  }
  return data as RestaurantSettingsRow | null;
}

async function listDeliveryZones(supabase: ReturnType<typeof createSupabaseAdminClient>, restaurantId: string) {
  const { data, error } = await supabase
    .from("restaurant_delivery_zones")
    .select("id,name,city,center_latitude,center_longitude,radius_km,delivery_fee,min_order_amount,is_active")
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true);
  if (error) {
    console.error("Could not read WhatsApp delivery zones", error);
    return [];
  }
  return (data ?? []) as DeliveryZoneRow[];
}

async function listBusinessHours(supabase: ReturnType<typeof createSupabaseAdminClient>, restaurantId: string) {
  const { data, error } = await supabase
    .from("business_hours")
    .select("day_of_week,opens_at,closes_at,is_closed")
    .eq("restaurant_id", restaurantId)
    .order("day_of_week");
  if (error) {
    console.error("Could not read WhatsApp business hours", error);
    return [];
  }
  return (data ?? []) as BusinessHourRow[];
}

async function hasOpenCashSession(supabase: ReturnType<typeof createSupabaseAdminClient>, restaurantId: string) {
  const { data } = await supabase
    .from("cash_sessions")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("status", "open")
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

async function hasActiveClosure(supabase: ReturnType<typeof createSupabaseAdminClient>, restaurantId: string) {
  const now = new Date().toISOString();
  const { data } = await supabase
    .from("restaurant_announcements")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("type", "closure")
    .eq("is_active", true)
    .lte("starts_at", now)
    .or(`ends_at.is.null,ends_at.gte.${now}`)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

function resolveWhatsAppDeliveryPolicy({
  restaurant,
  latitude,
  longitude,
  zones,
  settings,
  subtotal,
}: {
  restaurant: RestaurantRow;
  latitude: number;
  longitude: number;
  zones: DeliveryZoneRow[];
  settings: RestaurantSettingsRow;
  subtotal: number;
}): DeliveryPolicy {
  const hasRestaurantPoint = hasValidCoordinates(Number(restaurant.latitude), Number(restaurant.longitude));
  const restaurantPoint = hasRestaurantPoint
    ? { latitude: Number(restaurant.latitude), longitude: Number(restaurant.longitude) }
    : { latitude, longitude };
  const deliveryPoint = { latitude, longitude };
  const distanceKm = calculateDistanceKm(restaurantPoint, deliveryPoint);
  const matchingZones = zones
    .filter((zone) => {
      const center = hasValidCoordinates(Number(zone.center_latitude), Number(zone.center_longitude))
        ? { latitude: Number(zone.center_latitude), longitude: Number(zone.center_longitude) }
        : restaurantPoint;
      return calculateDistanceKm(center, deliveryPoint) <= Number(zone.radius_km);
    })
    .sort((left, right) => Number(left.radius_km) - Number(right.radius_km));
  const zone = matchingZones[0];
  const freeFrom = Number(settings.free_delivery_from ?? 0);
  const configuredFee = Number(zone?.delivery_fee ?? settings.delivery_fee);
  const farDistance = Math.max(1, Number(settings.far_delivery_distance_km) || 5);

  return {
    distanceKm: roundTo(distanceKm, 2),
    deliveryFee: freeFrom > 0 && subtotal >= freeFrom ? 0 : roundMoney(configuredFee),
    minOrderAmount: Number(zone?.min_order_amount ?? settings.min_order_amount),
    requiresQrPrepayment: Boolean(settings.delivery_qr_prepayment_enabled) && distanceKm >= farDistance,
    sameCity: !hasRestaurantPoint || distanceKm <= 50,
    zoneName: zone?.name ?? null,
  };
}

async function sendDraftValidationError(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  row: WhatsAppMessageRow,
  conversation: WhatsAppConversationRow,
  error: unknown,
) {
  const key = error instanceof Error ? error.message : "unknown";
  const minimum = key.startsWith("minimum:") ? key.split(":")[1] : null;
  const messages: Record<string, string> = {
    "empty-order": "El pedido esta vacio. Agrega un producto para continuar.",
    "restaurant-unavailable": "El restaurante ya no esta disponible para recibir este pedido.",
    "temporarily-closed": "El restaurante marco un cierre temporal y no puede recibir el pedido ahora.",
    "product-unavailable": "Uno de los productos dejo de estar disponible. Revisa el menu actualizado.",
    "product-configuration": "Cambio la configuracion de un producto. Vuelve a elegirlo para continuar.",
    "order-type-required": "Falta elegir entre recojo y delivery.",
    "order-type-disabled": "La forma de entrega elegida ya no esta habilitada.",
    "customer-name-required": "Falta el nombre del cliente.",
    "delivery-location": "Falta una direccion o una ubicacion GPS valida para el delivery.",
    "different-city": "Esa ubicacion parece estar demasiado lejos para el delivery de este restaurante. Puedes volver para enviar otra ubicacion o empezar de nuevo.",
    "outside-hours": "La hora elegida esta fuera del horario del restaurante. Puedes programar otra fecha y hora.",
    "schedule-past": "La hora programada ya paso. Elige una fecha futura.",
    "no-open-cash": "La caja no esta abierta para un pedido inmediato. Puedes programarlo para mas tarde.",
    "invoice-required": "Faltan datos para la factura.",
    "invoice-disabled": "La facturacion fue deshabilitada por el restaurante.",
    "payment-required": "Falta elegir la forma de pago.",
    "qr-required-distance": "Por la distancia del delivery, este pedido requiere prepago por QR.",
    "qr-unavailable": "El restaurante no tiene un QR configurado en este momento.",
    "receipt-required": "Falta enviar el comprobante del pago QR.",
  };
  await sendWhatsAppTextMessage({
    to: row.from_phone,
    body: minimum ? `El pedido minimo para esta zona es Bs ${minimum}. Agrega otro producto para continuar.` : messages[key] ?? "No pude validar el pedido. Revisa los datos e intenta nuevamente.",
  });

  if (key === "product-unavailable" || key === "product-configuration" || minimum) {
    const draft = await getOpenDraft(supabase, conversation.id);
    const restaurant = await findRestaurantById(supabase, draft?.restaurant_id ?? conversation.restaurant_id ?? "");
    if (restaurant) {
      await updateOpenDraft(supabase, conversation.id, { checkout_step: "catalog", status: "open" });
      await sendCategoryPicker(supabase, row.from_phone, restaurant);
    }
  }
}

async function storeInboundPaymentReceipt(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  row: WhatsAppMessageRow,
  draft: WhatsAppOrderDraftRow,
) {
  if (!draft.restaurant_id) {
    throw new Error("missing-restaurant");
  }
  const message = objectValue(row.payload.message);
  const media = row.message_type === "image" ? objectValue(message.image) : objectValue(message.document);
  const mediaId = stringValue(media.id);
  if (!mediaId) {
    throw new Error("missing-media-id");
  }

  const token = Deno.env.get("WHATSAPP_TOKEN");
  if (!token) {
    throw new Error("missing-whatsapp-token");
  }
  const metadataResponse = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const metadata = objectValue(await metadataResponse.json().catch(() => null));
  const mediaUrl = stringValue(metadata.url);
  const declaredSize = Number(metadata.file_size ?? 0);
  if (!metadataResponse.ok || !mediaUrl || declaredSize > MAX_RECEIPT_BYTES) {
    throw new Error("invalid-media-metadata");
  }

  const downloadResponse = await fetch(mediaUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!downloadResponse.ok) {
    throw new Error("media-download-failed");
  }
  const contentType = (downloadResponse.headers.get("content-type") ?? stringValue(metadata.mime_type) ?? "").split(";")[0].trim().toLowerCase();
  if (!allowedReceiptMimeType(contentType)) {
    throw new Error("unsupported-receipt-type");
  }
  const body = await downloadResponse.arrayBuffer();
  if (body.byteLength === 0 || body.byteLength > MAX_RECEIPT_BYTES) {
    throw new Error("invalid-receipt-size");
  }

  const now = new Date();
  const extension = receiptExtension(contentType);
  const path = `restaurants/${draft.restaurant_id}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(RECEIPT_BUCKET).upload(path, body, {
    contentType,
    upsert: false,
  });
  if (error) {
    throw error;
  }

  return {
    mediaId,
    url: `${getSiteUrl()}/api/storage/whatsapp-receipts/${path}`,
  };
}

function allowedReceiptMimeType(value: string) {
  return ["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(value);
}

function receiptExtension(value: string) {
  return value === "image/jpeg" ? "jpg" : value === "image/png" ? "png" : value === "image/webp" ? "webp" : "pdf";
}

async function abandonOpenDraft(supabase: ReturnType<typeof createSupabaseAdminClient>, conversationId: string) {
  const draft = await getOpenDraft(supabase, conversationId);
  if (!draft) {
    return;
  }

  await supabase.from("whatsapp_order_drafts").update({ status: "abandoned" }).eq("id", draft.id);
}

async function setConversationRestaurant(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  conversationId: string,
  restaurantId: string,
  state: string,
  intent: string,
  messageId: string,
) {
  await supabase
    .from("whatsapp_conversations")
    .update({ restaurant_id: restaurantId, state, last_intent: intent, last_message_id: messageId })
    .eq("id", conversationId);
}

async function clearConversationRestaurant(supabase: ReturnType<typeof createSupabaseAdminClient>, conversationId: string, messageId: string) {
  await supabase
    .from("whatsapp_conversations")
    .update({ restaurant_id: null, state: "choosing_restaurant", last_intent: "change_restaurant", last_message_id: messageId })
    .eq("id", conversationId);
}

async function updateConversationState(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  conversationId: string,
  state: string,
  intent: string,
  messageId: string,
) {
  await supabase.from("whatsapp_conversations").update({ state, last_intent: intent, last_message_id: messageId }).eq("id", conversationId);
}

function normalizeDraft(value: JsonObject): WhatsAppOrderDraftRow {
  const pendingValue = objectValue(value.pending_item);
  const pendingProductId = stringValue(pendingValue.product_id);
  const pendingItem: PendingDraftItem | null = pendingProductId
    ? {
        product_id: pendingProductId,
        product_name: stringValue(pendingValue.product_name) ?? "Producto",
        base_price: numberValue(pendingValue.base_price) ?? 0,
        variant_id: stringValue(pendingValue.variant_id),
        variant_name: stringValue(pendingValue.variant_name),
        option_ids: stringArray(pendingValue.option_ids),
        option_names: stringArray(pendingValue.option_names),
        group_index: Math.max(0, Math.floor(numberValue(pendingValue.group_index) ?? 0)),
        quantity: normalizeQuantity(numberValue(pendingValue.quantity)),
      }
    : null;

  return {
    id: stringValue(value.id) ?? "",
    conversation_id: stringValue(value.conversation_id) ?? "",
    customer_id: stringValue(value.customer_id) ?? "",
    restaurant_id: stringValue(value.restaurant_id),
    status: stringValue(value.status) ?? "open",
    items: normalizeDraftItems(value.items),
    checkout_step: stringValue(value.checkout_step) ?? "catalog",
    pending_item: pendingItem,
    customer_name: stringValue(value.customer_name),
    customer_address: stringValue(value.customer_address),
    customer_address_detail: stringValue(value.customer_address_detail),
    delivery_latitude: numberValue(value.delivery_latitude),
    delivery_longitude: numberValue(value.delivery_longitude),
    delivery_maps_url: stringValue(value.delivery_maps_url),
    delivery_distance_km: numberValue(value.delivery_distance_km),
    delivery_fee: numberValue(value.delivery_fee) ?? 0,
    requires_prepayment: value.requires_prepayment === true,
    requested_fulfillment_at: stringValue(value.requested_fulfillment_at),
    order_type: value.order_type === "delivery" || value.order_type === "pickup" ? value.order_type : null,
    payment_method: value.payment_method === "cash" || value.payment_method === "qr" ? value.payment_method : null,
    payment_receipt_url: stringValue(value.payment_receipt_url),
    payment_receipt_media_id: stringValue(value.payment_receipt_media_id),
    invoice_required: typeof value.invoice_required === "boolean" ? value.invoice_required : null,
    invoice_document_type: stringValue(value.invoice_document_type),
    invoice_document_number: stringValue(value.invoice_document_number),
    invoice_name: stringValue(value.invoice_name),
    notes: stringValue(value.notes),
    created_order_id: stringValue(value.created_order_id),
  };
}

function normalizeDraftItems(value: unknown): DraftItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item, index) => {
    const object = objectValue(item);
    const productId = stringValue(object.product_id);
    const productName = stringValue(object.product_name);
    const unitPrice = Number(object.unit_price);
    const quantity = Number(object.quantity);

    if (!productId || !productName || !Number.isFinite(unitPrice) || !Number.isFinite(quantity) || quantity <= 0) {
      return [];
    }

    return [
      {
        cart_id: stringValue(object.cart_id) ?? `legacy-${index}-${productId}`,
        product_id: productId,
        product_name: productName,
        variant_id: stringValue(object.variant_id),
        option_ids: stringArray(object.option_ids),
        unit_price: roundMoney(unitPrice),
        quantity: Math.max(1, Math.floor(quantity)),
        subtotal: roundMoney(Number(object.subtotal) || unitPrice * quantity),
        notes: stringValue(object.notes),
      },
    ];
  });
}

function parseProductSearchInput(text: string) {
  const normalized = normalizeForMatch(text)
    .replace(/\b(quiero|quisiera|deseo|pedir|pedido|ordenar|comprar|agrega|agregar|anade|anadir|dame|deme|me das|por favor|porfa)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  let quantity: number | null = null;
  let query = normalized;
  const quantityWords = "(un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)";
  const prefix = new RegExp(`^(?:(\\d{1,2})|${quantityWords})(?:\\s*x)?\\s+(.+)$`).exec(query);
  const compactPrefix = /^(\d{1,2})\s*x\s*(.+)$/.exec(query);
  const suffix = /^(.+?)\s+(?:x\s*)?(\d{1,2})$/.exec(query);

  if (prefix) {
    quantity = normalizeQuantity(Number(prefix[1]) || quantityWordValue(prefix[2]));
    query = prefix[3] ?? "";
  } else if (compactPrefix) {
    quantity = normalizeQuantity(Number(compactPrefix[1]));
    query = compactPrefix[2] ?? "";
  } else if (suffix) {
    quantity = normalizeQuantity(Number(suffix[2]));
    query = suffix[1] ?? "";
  }

  query = searchTokens(query)
    .filter((token) => !checkoutSignalTokens().has(token))
    .join(" ");

  return { query, quantity };
}

function scoreProductMatch(query: string, product: ProductSummaryRow) {
  const normalizedQuery = normalizeForMatch(query);
  const normalizedName = normalizeForMatch(product.name);
  const queryTokens = searchTokens(normalizedQuery);
  const nameTokens = searchTokens(normalizedName);
  if (queryTokens.length === 0 || nameTokens.length === 0) {
    return 0;
  }

  if (normalizedName === normalizedQuery) {
    return 100;
  }
  if (normalizedName.includes(normalizedQuery)) {
    return 92;
  }
  if (normalizedQuery.includes(normalizedName) && normalizedName.length >= 4) {
    return 88;
  }

  const matched = queryTokens.filter((queryToken) =>
    nameTokens.some((nameToken) => nameToken === queryToken || nameToken.includes(queryToken) || queryToken.includes(nameToken)),
  ).length;
  if (matched === queryTokens.length) {
    return 72 + matched;
  }
  if (matched > 0 && queryTokens.length <= 2) {
    return 45 + matched * 8;
  }

  const descriptionTokens = searchTokens(product.description ?? "");
  const descriptionMatches = queryTokens.filter((queryToken) => descriptionTokens.includes(queryToken)).length;
  return descriptionMatches === queryTokens.length ? 40 + descriptionMatches : 0;
}

function parseCompactCheckoutInput(text: string, draft?: WhatsAppOrderDraftRow): CompactCheckoutInput {
  const rawSegments = text
    .split(/\s*[|;\n]\s*/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  const segments = rawSegments.map(stripCheckoutLinePrefix);
  const normalizedSegments = (segments.length ? segments : [text]).map((segment) => normalizeForMatch(segment));
  const normalized = normalizedSegments.join("\n");
  const invoiceFields = parseInvoiceFieldsFromSegments(segments);
  const taggedTime = readTaggedSegment(segments, ["hora", "cuando", "tiempo"]);
  const scheduledLocalInput =
    parseScheduleInput(taggedTime ?? "") ??
    parseScheduleInput(text) ??
    segments.map(parseScheduleInput).find(Boolean) ??
    normalizedSegments.map(parseScheduleInput).find(Boolean) ??
    null;
  const scheduledIso = scheduledLocalInput ? localDateTimeInputToIso(scheduledLocalInput) : null;
  const orderType = parseOrderTypeText(readTaggedSegment(segments, ["entrega", "recibir", "tipo de entrega"]) ?? normalized);
  const paymentMethod = parsePaymentMethodText(readTaggedSegment(segments, ["pago", "forma de pago"]) ?? normalized);
  const invoiceRequired = invoiceFields ? true : parseInvoicePreferenceText(readTaggedSegment(segments, ["factura"]) ?? normalized);
  const fulfillment = parseFulfillmentText(taggedTime ?? normalized, scheduledLocalInput);
  const taggedName = readTaggedSegment(segments, ["cliente", "nombre cliente", "a nombre de"]);
  const taggedAddress = readTaggedSegment(segments, ["direccion", "dir", "ubicacion"]);
  const taggedReference = readTaggedSegment(segments, ["referencia", "ref", "detalle", "indicacion"]);
  const targetOrderType = orderType ?? draft?.order_type ?? null;
  const leftovers = segments.filter((segment) => !isRecognizedCheckoutSegment(segment));
  let customerName = taggedName ? truncate(taggedName, 120) : null;
  let customerAddress = taggedAddress ? truncate(taggedAddress, 240) : null;
  let customerAddressDetail = taggedReference ? normalizeOptionalText(taggedReference, 180) : null;

  if (!customerName && draft?.checkout_step === "name" && leftovers[0]) {
    customerName = truncate(leftovers[0], 120);
  }

  if (!invoiceFields && targetOrderType === "delivery") {
    if (!customerAddress && draft?.checkout_step === "address" && leftovers[0]) {
      customerAddress = truncate(leftovers[0], 240);
      customerAddressDetail = leftovers[1] ? normalizeOptionalText(leftovers[1], 180) : null;
    } else if (!customerAddress && leftovers.length >= 2 && orderType) {
      customerName = customerName ?? truncate(leftovers[0], 120);
      customerAddress = truncate(leftovers[1], 240);
      customerAddressDetail = leftovers[2] ? normalizeOptionalText(leftovers[2], 180) : customerAddressDetail;
    }

    if (!customerAddressDetail && draft?.checkout_step === "address_detail" && leftovers[0]) {
      customerAddressDetail = normalizeOptionalText(leftovers[0], 180);
    }
  } else if (!invoiceFields && !customerName && segments.length > 1 && leftovers[0]) {
    customerName = truncate(leftovers[0], 120);
  }

  return {
    hasSignal: Boolean(
      segments.length > 1 ||
        orderType ||
        paymentMethod ||
        invoiceRequired !== null ||
        fulfillment ||
        invoiceFields ||
        taggedName ||
        taggedAddress ||
        taggedReference,
    ),
    orderType,
    fulfillment,
    scheduledIso,
    scheduledLocalInput,
    customerName,
    customerAddress,
    customerAddressDetail,
    paymentMethod,
    invoiceRequired: invoiceFields ? true : invoiceRequired,
    invoiceFields,
  };
}

function parseOrderTypeText(value: string | null) {
  if (!value) {
    return null;
  }
  const normalized = normalizeForMatch(value);
  const hasDelivery = /\b(delivery|envio|enviar|domicilio|llevar a casa)\b/.test(normalized);
  const hasPickup = /\b(recojo|retiro|recoger|pickup|paso por|en tienda)\b/.test(normalized);
  if (hasDelivery === hasPickup) {
    return null;
  }
  return hasDelivery ? "delivery" : "pickup";
}

function parsePaymentMethodText(value: string | null) {
  if (!value) {
    return null;
  }
  const normalized = normalizeForMatch(value);
  const hasQr = /\b(qr|transferencia|pago movil)\b/.test(normalized);
  const hasCash = /\b(efectivo|cash|al contado)\b/.test(normalized);
  if (hasQr === hasCash) {
    return null;
  }
  return hasQr ? "qr" : "cash";
}

function parseInvoicePreferenceText(value: string | null) {
  if (!value) {
    return null;
  }
  const normalized = normalizeForMatch(value);
  if (/\b(sin factura|no factura|no necesito factura|sin nit)\b/.test(normalized)) {
    return false;
  }
  if (/\b(con factura|quiero factura|factura|nit)\b/.test(normalized)) {
    return true;
  }
  return null;
}

function parseFulfillmentText(value: string | null, scheduledLocalInput: string | null) {
  if (scheduledLocalInput) {
    return "schedule";
  }
  if (!value) {
    return null;
  }
  const normalized = normalizeForMatch(value);
  const hasSchedule = /\b(programar|programado|mas tarde|a las|para las)\b/.test(normalized);
  const hasNow = /\b(ahora|lo antes posible|cuanto antes|ya|inmediato)\b/.test(normalized);
  if (hasSchedule === hasNow) {
    return null;
  }
  return hasSchedule ? "schedule" : "now";
}

function parseInvoiceFieldsFromSegments(segments: string[]) {
  const cleanedSegments = segments.map(stripCheckoutLinePrefix);
  if (cleanedSegments.some((segment) => parseInvoicePreferenceText(segment) === false)) {
    return null;
  }

  const type = readTaggedSegment(cleanedSegments, ["tipo", "tipo documento", "documento"]);
  const number = readTaggedSegment(cleanedSegments, ["numero", "nro", "nit", "ci"]);
  const name = readTaggedSegment(cleanedSegments, ["nombre factura", "razon social", "nombre"]);
  if (type && number && name) {
    return {
      documentType: truncate(type, 24),
      documentNumber: truncate(number, 80),
      name: truncate(name, 160),
    };
  }

  const normalizedSegments = cleanedSegments.map((segment) => normalizeForMatch(segment));
  const invoiceIndex = normalizedSegments.findIndex((segment) => /\b(factura|nit|ci)\b/.test(segment));
  if (invoiceIndex === -1) {
    return null;
  }

  const fields = cleanedSegments
    .slice(invoiceIndex)
    .map((segment) => segment.replace(/^(factura|datos factura|facturacion)\s*:?\s*/i, "").trim())
    .filter((segment) => {
      const normalized = normalizeForMatch(segment);
      return segment && !["con factura", "factura", "si", "quiero factura"].includes(normalized);
    });
  if (fields.length < 3) {
    return null;
  }

  return {
    documentType: truncate(fields[0], 24),
    documentNumber: truncate(fields[1], 80),
    name: truncate(fields.slice(2).join(" "), 160),
  };
}

function readTaggedSegment(segments: string[], labels: string[]) {
  for (const segment of segments) {
    const cleanSegment = stripCheckoutLinePrefix(segment);
    const normalized = normalizeForMatch(cleanSegment);
    for (const label of [...labels].sort((left, right) => right.length - left.length)) {
      const normalizedLabel = normalizeForMatch(label);
      if (normalized.startsWith(`${normalizedLabel}:`) || normalized.startsWith(`${normalizedLabel} `)) {
        return cleanSegment.slice(label.length).replace(/^[:\s]+/, "").trim() || null;
      }
    }
  }
  return null;
}

function isRecognizedCheckoutSegment(segment: string) {
  const normalized = normalizeForMatch(stripCheckoutLinePrefix(segment));
  return (
    !normalized ||
    /\b(delivery|envio|enviar|domicilio|recojo|retiro|recoger|pickup|ahora|lo antes posible|programar|programado|efectivo|cash|qr|transferencia|sin factura|no factura|con factura|quiero factura)\b/.test(normalized) ||
    Boolean(parseScheduleInput(segment)) ||
    /^(cliente|nombre cliente|a nombre de|direccion|dir|ubicacion|referencia|ref|detalle|indicacion|entrega|recibir|tipo de entrega|hora|cuando|tiempo|pago|forma de pago|factura|tipo|tipo documento|documento|numero|nro|nit|ci|nombre|razon social)\b/.test(normalized)
  );
}

function stripCheckoutLinePrefix(value: string) {
  return value.replace(/^[^\w]+/, "").trim();
}

function normalizeOptionalText(value: string, maxLength: number) {
  return normalizeForMatch(value) === "no" || /\b(sin referencia|sin detalle|ninguna|ninguno)\b/.test(normalizeForMatch(value))
    ? null
    : truncate(value, maxLength);
}

function searchTokens(value: string) {
  return normalizeForMatch(value)
    .split(/\s+/)
    .map((token) => singularizeSearchToken(token.replace(/[^a-z0-9]/g, "")))
    .filter((token) => token.length >= 2 && !productSearchStopWords().has(token));
}

function singularizeSearchToken(token: string) {
  if (token.length > 4 && token.endsWith("es")) {
    return token.slice(0, -2);
  }
  if (token.length > 3 && token.endsWith("s")) {
    return token.slice(0, -1);
  }
  return token;
}

function productSearchStopWords() {
  return new Set(["de", "del", "la", "el", "los", "las", "con", "sin", "para", "por", "favor", "un", "una", "uno"]);
}

function checkoutSignalTokens() {
  return new Set(["delivery", "envio", "domicilio", "recojo", "retiro", "pickup", "ahora", "efectivo", "cash", "qr", "factura"]);
}

function quantityWordValue(value: string | undefined) {
  const values: Record<string, number> = {
    un: 1,
    una: 1,
    uno: 1,
    dos: 2,
    tres: 3,
    cuatro: 4,
    cinco: 5,
    seis: 6,
    siete: 7,
    ocho: 8,
    nueve: 9,
    diez: 10,
  };
  return value ? values[value] ?? null : null;
}

function normalizeQuantity(value: number | null) {
  if (!Number.isFinite(value)) {
    return null;
  }
  const quantity = Math.floor(Number(value));
  return quantity >= 1 && quantity <= 50 ? quantity : null;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function roundTo(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function draftSubtotal(draft: WhatsAppOrderDraftRow) {
  return roundMoney(draft.items.reduce((sum, item) => sum + item.subtotal, 0));
}

function formatDraftItems(draft: WhatsAppOrderDraftRow) {
  return draft.items
    .map((item) => `- ${item.quantity} x ${item.product_name}: Bs ${formatMoney(item.subtotal)}${item.notes ? `\n  ${item.notes}` : ""}`)
    .join("\n");
}

function formatDraftFulfillment(draft: WhatsAppOrderDraftRow) {
  const time = draft.requested_fulfillment_at
    ? new Date(draft.requested_fulfillment_at).toLocaleString("es-BO", {
        timeZone: RESTAURANT_TIME_ZONE,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "lo antes posible";
  return draft.order_type === "delivery"
    ? `Delivery a ${draft.customer_address}${draft.customer_address_detail ? ` (${draft.customer_address_detail})` : ""}, ${time}`
    : `Recojo en tienda, ${time}`;
}

function formatPriceDelta(value: number | string) {
  const delta = Number(value);
  return delta === 0 ? "Sin costo adicional" : `${delta > 0 ? "+" : "-"} Bs ${formatMoney(Math.abs(delta))}`;
}

function numberValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function hasValidCoordinates(latitude: number | null, longitude: number | null) {
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function coordinatesToMapsUrl(latitude: number, longitude: number) {
  return `https://www.google.com/maps/search/?api=1&query=${latitude.toFixed(7)},${longitude.toFixed(7)}`;
}

function calculateDistanceKm(from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }) {
  const radius = 6371;
  const latitudeDelta = ((to.latitude - from.latitude) * Math.PI) / 180;
  const longitudeDelta = ((to.longitude - from.longitude) * Math.PI) / 180;
  const fromLatitude = (from.latitude * Math.PI) / 180;
  const toLatitude = (to.latitude * Math.PI) / 180;
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function isProductCurrentlyOrderable(product: ProductSummaryRow, date = new Date()) {
  const time = date.getTime();
  if (product.available_from && new Date(product.available_from).getTime() > time) {
    return false;
  }
  if (product.available_until && new Date(product.available_until).getTime() < time) {
    return false;
  }

  const parts = zonedDateParts(date);
  const days = product.available_days;
  const start = timeToMinutes(product.available_start_time);
  const end = timeToMinutes(product.available_end_time);
  const hasDayRestriction = Boolean(days?.length);
  const currentDayAllowed = !hasDayRestriction || Boolean(days?.includes(parts.dayOfWeek));
  const previousDayAllowed = !hasDayRestriction || Boolean(days?.includes((parts.dayOfWeek + 6) % 7));
  if (start === null && end === null) {
    return currentDayAllowed;
  }
  if (start !== null && end !== null) {
    return start <= end
      ? currentDayAllowed && parts.minutesOfDay >= start && parts.minutesOfDay <= end
      : (currentDayAllowed && parts.minutesOfDay >= start) || (previousDayAllowed && parts.minutesOfDay <= end);
  }
  return start !== null
    ? currentDayAllowed && parts.minutesOfDay >= start
    : currentDayAllowed && end !== null && parts.minutesOfDay <= end;
}

function timeToMinutes(value?: string | null) {
  if (!value) {
    return null;
  }
  const [hour, minute] = value.slice(0, 5).split(":").map(Number);
  return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : null;
}

function zonedDateParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: RESTAURANT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  return {
    year,
    month,
    day,
    hour,
    minute,
    dayOfWeek: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
    minutesOfDay: hour * 60 + minute,
  };
}

function formatLocalDateTimeInput(date: Date) {
  const parts = zonedDateParts(date);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

function parseScheduleInput(value: string) {
  const normalized = value.trim();
  const simple = normalizeForMatch(normalized);
  const timeOnly = /^(?:(hoy|manana)\s+)?(\d{1,2}):(\d{2})$/.exec(simple);
  if (timeOnly) {
    const dayOffset = timeOnly[1] === "manana" ? 1 : 0;
    const parts = zonedDateParts(new Date(Date.now() + dayOffset * 24 * 60 * 60 * 1000));
    const hour = Number(timeOnly[2]);
    const minute = Number(timeOnly[3]);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return null;
    }
    return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(hour)}:${pad(minute)}`;
  }

  const match = /^(?:(\d{2})\/(\d{2})\/(\d{4})|(\d{4})-(\d{2})-(\d{2}))[ T](\d{2}):(\d{2})$/.exec(normalized);
  if (!match) {
    return null;
  }
  const year = Number(match[3] ?? match[4]);
  const month = Number(match[2] ?? match[5]);
  const day = Number(match[1] ?? match[6]);
  const hour = Number(match[7]);
  const minute = Number(match[8]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() + 1 !== month ||
    check.getUTCDate() !== day ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
}

function isLocalDateTimeWithinBusinessHours(value: string, hours: BusinessHourRow[]) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const minutes = Number(match[4]) * 60 + Number(match[5]);
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const configured = hours.some((hour) => !hour.is_closed && timeToMinutes(hour.opens_at) !== null && timeToMinutes(hour.closes_at) !== null);
  if (!configured) {
    return true;
  }

  const current = hours.find((hour) => hour.day_of_week === dayOfWeek);
  const previous = hours.find((hour) => hour.day_of_week === (dayOfWeek + 6) % 7);
  if (current && !current.is_closed) {
    const opens = timeToMinutes(current.opens_at);
    const closes = timeToMinutes(current.closes_at);
    if (opens !== null && closes !== null) {
      if (opens === closes || (opens < closes && minutes >= opens && minutes <= closes) || (opens > closes && minutes >= opens)) {
        return true;
      }
    }
  }
  if (previous && !previous.is_closed) {
    const opens = timeToMinutes(previous.opens_at);
    const closes = timeToMinutes(previous.closes_at);
    if (opens !== null && closes !== null && opens > closes && minutes <= closes) {
      return true;
    }
  }
  return false;
}

function localDateTimeInputToIso(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) {
    return null;
  }
  const utcGuess = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5])));
  const offset = getTimeZoneOffsetMs(utcGuess);
  return new Date(utcGuess.getTime() - offset).toISOString();
}

function getTimeZoneOffsetMs(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: RESTAURANT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const zoned = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return zoned - date.getTime();
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function parseWhatsAppTimestamp(timestamp: string | null) {
  if (!timestamp) {
    return null;
  }

  const seconds = Number(timestamp);

  if (!Number.isFinite(seconds)) {
    return null;
  }

  return new Date(seconds * 1000).toISOString();
}

function objectValue(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function recordArray(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.map(objectValue).filter((item) => Object.keys(item).length > 0) : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function maskPhone(phone: string) {
  return phone.length <= 6 ? "***" : `${phone.slice(0, 3)}...${phone.slice(-3)}`;
}

function summarizeText(text: string | null) {
  if (!text) {
    return null;
  }

  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}

function normalizeForMatch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeDigits(value: string) {
  return value.replace(/\D/g, "");
}

function phoneLookupVariants(phone: string) {
  const variants = new Set([phone]);

  if (phone.startsWith("591") && phone.length > 8) {
    variants.add(phone.slice(3));
  }

  return [...variants].filter(Boolean);
}

function isGreetingIntent(value: string) {
  return ["hola", "buenas", "buen dia", "buenos dias", "buenas tardes", "buenas noches", "hey", "hi"].includes(value);
}

function isMenuIntent(value: string) {
  return value === "ACTION_MENU".toLowerCase() || /\b(menu|carta|catalogo|productos|ver menu)\b/.test(value);
}

function isOrderIntent(value: string) {
  return value === "ACTION_ORDER".toLowerCase() || /\b(pedir|pedido|ordenar|comprar|quiero)\b/.test(value);
}

function isRecentOrdersIntent(value: string) {
  return value === "ACTION_ORDERS".toLowerCase() || /\b(mis pedidos|pedido anterior|ultimos pedidos|historial|estado)\b/.test(value);
}

function isChangeRestaurantIntent(value: string) {
  return value === "ACTION_CHANGE_RESTAURANT".toLowerCase() || /\b(cambiar|otro lugar|otro restaurante|restaurante)\b/.test(value);
}

function isBackIntent(value: string) {
  return value === "DRAFT_BACK".toLowerCase() || /\b(volver|atras|anterior|regresar|retroceder)\b/.test(value);
}

function isRestartIntent(value: string) {
  return (
    value === "DRAFT_RESTART".toLowerCase() ||
    /\b(empezar de nuevo|reiniciar|nuevo pedido|cancelar todo|borrar pedido|desde cero)\b/.test(value)
  );
}

function isConfirmIntent(value: string) {
  return /\b(confirmar|confirmo|enviar pedido|finalizar|listo)\b/.test(value);
}

function detectIntent(value: string) {
  if (isRecentOrdersIntent(value)) {
    return "recent_orders";
  }

  if (isOrderIntent(value)) {
    return "order";
  }

  if (isMenuIntent(value)) {
    return "menu";
  }

  if (isGreetingIntent(value)) {
    return "greeting";
  }

  return "unknown";
}

function getSiteUrl() {
  const value = Deno.env.get("NEXT_PUBLIC_SITE_URL") ?? Deno.env.get("SITE_URL") ?? Deno.env.get("NEXT_PUBLIC_APP_URL") ?? "https://yopido.shop";
  return value.replace(/\/+$/, "");
}

function resolvePublicImageUrl(value: string | null) {
  const imageUrl = value?.trim();
  if (!imageUrl) {
    return null;
  }

  if (/^https?:\/\//i.test(imageUrl)) {
    return imageUrl;
  }

  if (imageUrl.startsWith("/")) {
    return `${getSiteUrl()}${imageUrl}`;
  }

  return `${getSiteUrl()}/${imageUrl}`;
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - 3))}...` : value;
}

function formatMoney(value: number | string) {
  return Number(value).toFixed(2);
}

function formatRecentOrder(order: RecentOrderRow) {
  const date = new Date(order.created_at).toLocaleDateString("es-BO", {
    day: "2-digit",
    month: "2-digit",
  });

  return `- ${order.order_number} (${date}): ${order.status}, pago ${order.payment_status}, Bs ${formatMoney(order.total)}`;
}

export async function sendWhatsAppTextMessage({
  to,
  body,
  previewUrl = false,
  phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID"),
}: {
  to: string;
  body: string;
  previewUrl?: boolean;
  phoneNumberId?: string;
}) {
  const token = Deno.env.get("WHATSAPP_TOKEN");

  if (!token || !phoneNumberId) {
    throw new Error("WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID are required");
  }

  const response = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: {
        body,
        preview_url: previewUrl,
      },
    }),
  });

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    console.error("Meta WhatsApp send failed", result);
    throw new Error("whatsapp_send_failed");
  }

  await rememberOutboundWhatsAppMessage({
    to,
    phoneNumberId,
    messageType: "text",
    messageText: body,
    source: "bot_text",
    outboundPayload: {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: {
        body,
        preview_url: previewUrl,
      },
    },
    result,
  });

  return result;
}

async function sendWhatsAppImageMessage({
  to,
  imageUrl,
  caption,
}: {
  to: string;
  imageUrl: string;
  caption?: string;
}) {
  return sendMetaWhatsAppMessage({
    messaging_product: "whatsapp",
    to,
    type: "image",
    image: {
      link: imageUrl,
      ...(caption ? { caption: truncate(caption, 1024) } : {}),
    },
  });
}

async function sendWhatsAppLocationRequest({ to, body }: { to: string; body: string }) {
  return sendMetaWhatsAppMessage({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "location_request_message",
      body: { text: truncate(body, 1024) },
      action: { name: "send_location" },
    },
  });
}

async function sendWhatsAppInteractiveButtons({
  to,
  body,
  buttons,
}: {
  to: string;
  body: string;
  buttons: Array<{ id: string; title: string }>;
}) {
  return sendMetaWhatsAppMessage({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: truncate(body, 1024),
      },
      action: {
        buttons: buttons.slice(0, 3).map((button) => ({
          type: "reply",
          reply: {
            id: truncate(button.id, 256),
            title: truncate(button.title, 20),
          },
        })),
      },
    },
  });
}

async function sendWhatsAppListMessage({
  to,
  body,
  buttonText,
  sectionTitle,
  rows,
}: {
  to: string;
  body: string;
  buttonText: string;
  sectionTitle: string;
  rows: Array<{ id: string; title: string; description: string }>;
}) {
  return sendMetaWhatsAppMessage({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: {
        text: truncate(body, 1024),
      },
      action: {
        button: truncate(buttonText, 20),
        sections: [
          {
            title: truncate(sectionTitle, 24),
            rows: rows.slice(0, 10).map((row) => ({
              id: truncate(row.id, 200),
              title: truncate(row.title, 24),
              description: truncate(row.description, 72),
            })),
          },
        ],
      },
    },
  });
}

async function sendMetaWhatsAppMessage(body: JsonObject) {
  const token = Deno.env.get("WHATSAPP_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");

  if (!token || !phoneNumberId) {
    throw new Error("WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID are required");
  }

  const response = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    console.error("Meta WhatsApp send failed", result);
    throw new Error("whatsapp_send_failed");
  }

  await rememberOutboundWhatsAppMessage({
    to: stringValue(body.to) ?? "",
    phoneNumberId,
    messageType: stringValue(body.type) ?? "unknown",
    messageText: extractOutboundMessageText(body),
    source: "bot",
    outboundPayload: body,
    result,
  });

  return result;
}

function extractOutboundMessageText(body: JsonObject) {
  const type = stringValue(body.type);
  if (type === "text") {
    return stringValue(objectValue(body.text).body) ?? "Mensaje enviado";
  }
  if (type === "image") {
    return stringValue(objectValue(body.image).caption) ?? "Imagen enviada";
  }
  if (type === "interactive") {
    const interactive = objectValue(body.interactive);
    return stringValue(objectValue(interactive.body).text) ?? "Mensaje interactivo enviado";
  }
  return "Mensaje enviado";
}

async function rememberOutboundWhatsAppMessage({
  to,
  phoneNumberId,
  messageType,
  messageText,
  source,
  outboundPayload,
  result,
}: {
  to: string;
  phoneNumberId: string;
  messageType: string;
  messageText: string;
  source: string;
  outboundPayload: JsonObject;
  result: unknown;
}) {
  if (!to.trim()) {
    return;
  }

  try {
    const resultPayload = objectValue(result);
    const messages = recordArray(resultPayload.messages);
    const messageId = stringValue(messages[0]?.id) ?? `outbound-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const supabase = createSupabaseAdminClient();
    const { data: conversation } = await supabase
      .from("whatsapp_conversations")
      .select("id,restaurant_id")
      .eq("from_phone", to)
      .maybeSingle();

    await supabase.from("whatsapp_messages").upsert(
      {
        message_id: messageId,
        from_phone: to,
        to_phone_number_id: phoneNumberId,
        to_display_phone: null,
        contact_name: null,
        message_type: messageType,
        message_text: messageText,
        payload: {
          direction: "outbound",
          source,
          restaurant_id: conversation?.restaurant_id ?? null,
          conversation_id: conversation?.id ?? null,
          outbound_payload: outboundPayload,
          meta_response: resultPayload,
        },
        whatsapp_timestamp: now,
        received_at: now,
      },
      { onConflict: "message_id", ignoreDuplicates: true },
    );

    if (conversation?.id) {
      await supabase
        .from("whatsapp_conversations")
        .update({
          last_message_id: messageId,
          last_message_at: now,
        })
        .eq("id", conversation.id);
    }
  } catch (error) {
    console.error("Could not store outbound WhatsApp message", error);
  }
}

function getVerifyToken() {
  return Deno.env.get("VERIFY_TOKEN") ?? Deno.env.get("WHATSAPP_VERIFY_TOKEN");
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
