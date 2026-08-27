import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const webhookPath = new URL("../supabase/functions/whatsapp-webhook/index.ts", import.meta.url);
const migrationPath = new URL("../supabase/migrations/0085_whatsapp_order_checkout.sql", import.meta.url);
const botSettingsMigrationPath = new URL("../supabase/migrations/0087_restaurant_whatsapp_bot_settings.sql", import.meta.url);
const platformSettingsMigrationPath = new URL("../supabase/migrations/0088_platform_whatsapp_settings.sql", import.meta.url);
const whatsappReceiptRoutePath = new URL("../src/app/api/storage/whatsapp-receipts/[...key]/route.ts", import.meta.url);
const privateReceiptRoutePath = new URL("../src/app/api/storage/private/[...key]/route.ts", import.meta.url);
const receiptViewerPath = new URL("../src/components/payments/ReceiptViewerButton.tsx", import.meta.url);
const crmServicePath = new URL("../src/lib/services/whatsapp-crm.service.ts", import.meta.url);
const crmClientPath = new URL("../src/components/whatsapp/WhatsAppCrmClient.tsx", import.meta.url);
const crmActionsPath = new URL("../src/app/admin/restaurantes/[restaurantId]/whatsapp/actions.ts", import.meta.url);
const platformServicePath = new URL("../src/lib/services/platform-whatsapp.service.ts", import.meta.url);
const platformPagePath = new URL("../src/app/admin/whatsapp/page.tsx", import.meta.url);
const platformClientPath = new URL("../src/components/admin/PlatformWhatsAppSettingsClient.tsx", import.meta.url);
const adminShellPath = new URL("../src/components/layout/AdminShellClient.tsx", import.meta.url);
const settingsClientPath = new URL("../src/components/settings/RestaurantSettingsFormClient.tsx", import.meta.url);
const adminActionsPath = new URL("../src/app/admin/actions.ts", import.meta.url);
const publicStoragePath = new URL("../src/lib/supabase/storage.ts", import.meta.url);
const whatsappProductImagesMigrationPath = new URL("../supabase/migrations/0089_product_whatsapp_images.sql", import.meta.url);

test("WhatsApp checkout reuses the canonical order RPC with a stable request id", async () => {
  const source = await readFile(webhookPath, "utf8");

  assert.match(source, /create_public_order_transaction/);
  assert.match(source, /p_request_id: draft\.id/);
  assert.match(source, /order_origin: "phone_whatsapp"/);
  assert.match(source, /variant_id: item\.variant_id/);
  assert.match(source, /option_ids: item\.option_ids/);
});

test("WhatsApp checkout collects delivery location and QR receipt evidence", async () => {
  const source = await readFile(webhookPath, "utf8");

  assert.match(source, /location_request_message/);
  assert.match(source, /delivery_distance_km/);
  assert.match(source, /requires_prepayment/);
  assert.match(source, /storeInboundPaymentReceipt/);
  assert.match(source, /whatsapp-payment-receipts/);
});

test("WhatsApp ordering supports compact text shortcuts", async () => {
  const source = await readFile(webhookPath, "utf8");

  assert.match(source, /tryBeginProductFromText/);
  assert.match(source, /parseProductSearchInput/);
  assert.match(source, /quantity: normalizeQuantity\(initialQuantity\)/);
  assert.match(source, /applyCompactCheckoutInput/);
  assert.match(source, /formatCheckoutGuide/);
  assert.match(source, /sendCheckoutGuide/);
  assert.match(source, /Responde copiando esto y elige entre/);
  assert.match(source, /🛵 Entrega: \$\{deliveryOptions\}/);
  assert.match(source, /🕒 Hora: ahora o la hora que te gustaria recibir/);
  assert.match(source, /👤 Cliente: \$\{profile\.customerName \?\? "nombre completo"\}/);
  assert.match(source, /💵 Pago: \$\{paymentOptions\}/);
  assert.match(source, /stripCheckoutLinePrefix/);
  assert.doesNotMatch(source, /Puedes tocar una opcion/);
  assert.doesNotMatch(source, /recojo \| ahora \| Tu nombre/);
});

test("WhatsApp checkout can reuse recent customer delivery addresses", async () => {
  const source = await readFile(webhookPath, "utf8");

  assert.match(source, /getSavedCheckoutProfile/);
  assert.match(source, /Direcciones guardadas/);
  assert.match(source, /Para usar una, responde Direccion: 1 o solo 1/);
  assert.match(source, /parseSavedDeliveryAddressSelection/);
  assert.match(source, /applySavedDeliveryAddressShortcut/);
  assert.match(source, /customer_name: draft\.customer_name \?\? profile\.customerName/);
  assert.match(source, /customer_address: savedAddress\.address/);
  assert.match(source, /delivery_latitude: savedAddress\.latitude/);
  assert.match(source, /await continueAfterCompactCheckout\(supabase, row, conversation, updated, true\)/);
});

test("WhatsApp delivery address and reference are collected in one message", async () => {
  const source = await readFile(webhookPath, "utf8");

  assert.match(source, /sendDeliveryAddressRequest/);
  assert.match(source, /Escribe calle y referencia en un solo mensaje/);
  assert.match(source, /📍 Calle: Av\. Siempre Viva/);
  assert.match(source, /🏠 Referencia: puerta negra, piso 2, casa verde/);
  assert.match(source, /La referencia es necesaria para el repartidor/);
  assert.match(source, /Falta la referencia para el repartidor/);
  assert.match(source, /readTaggedSegment\(segments, \["calle", "direccion", "dir", "ubicacion"\]\)/);
  assert.doesNotMatch(source, /Agrega una referencia para el repartidor/);
  assert.doesNotMatch(source, /Volvimos a la referencia/);
  assert.doesNotMatch(source, /Si no hay referencia/);
});

test("WhatsApp delivery distance can force QR after location is calculated", async () => {
  const source = await readFile(webhookPath, "utf8");

  assert.match(source, /deliveryPolicy\?\.requiresQrPrepayment && paymentMethod !== "qr"/);
  assert.match(source, /paymentMethod = "qr"/);
  assert.match(source, /sendQrPaymentInstructions/);
  assert.match(source, /receipt-required/);
});

test("WhatsApp QR receipts prefer Cloudflare R2 private storage with Supabase fallback", async () => {
  const source = await readFile(webhookPath, "utf8");

  assert.match(source, /getR2Config/);
  assert.match(source, /R2_ACCOUNT_ID/);
  assert.match(source, /R2_PRIVATE_BUCKET/);
  assert.match(source, /uploadReceiptToR2/);
  assert.match(source, /api\/storage\/private/);
  assert.match(source, /falling back to Supabase Storage/);
  assert.match(source, /whatsapp-payment-receipts/);
});

test("WhatsApp checkout migration and private receipt route are present", async () => {
  const [migration, whatsappRoute, privateRoute] = await Promise.all([
    readFile(migrationPath, "utf8"),
    readFile(whatsappReceiptRoutePath, "utf8"),
    readFile(privateReceiptRoutePath, "utf8"),
  ]);

  assert.match(migration, /add column if not exists checkout_step/);
  assert.match(migration, /add column if not exists pending_item jsonb/);
  assert.match(migration, /'whatsapp-payment-receipts'/);
  assert.match(migration, /false,\s*5242880/);
  assert.match(whatsappRoute, /global_role === "superadmin"/);
  assert.match(whatsappRoute, /restaurant_memberships/);
  assert.match(whatsappRoute, /createSignedUrl/);
  assert.match(privateRoute, /getPrivateFileSignedUrl\(path, \{/);
  assert.match(privateRoute, /downloadFileName/);
  assert.match(privateRoute, /canReadRestaurantStorage/);
  assert.match(privateRoute, /restaurant_memberships/);
  assert.match(privateRoute, /Cache-Control/);
});

test("receipt viewer serves app storage URLs from the current origin", async () => {
  const source = await readFile(receiptViewerPath, "utf8");

  assert.match(source, /appStorageRoutePrefixes/);
  assert.match(source, /\/api\/storage\/private\//);
  assert.match(source, /\/api\/storage\/whatsapp-receipts\//);
  assert.match(source, /sameOriginReceiptUrl/);
  assert.match(source, /window\.location\.origin/);
  assert.match(source, /receiptDownloadUrl/);
  assert.match(source, /searchParams\.set\("download", "1"\)/);
});

test("WhatsApp bot settings are configurable per restaurant from the CRM", async () => {
  const [migration, service, client, actions] = await Promise.all([
    readFile(botSettingsMigrationPath, "utf8"),
    readFile(crmServicePath, "utf8"),
    readFile(crmClientPath, "utf8"),
    readFile(crmActionsPath, "utf8"),
  ]);

  assert.match(migration, /create table if not exists restaurant_whatsapp_bot_settings/);
  assert.match(migration, /bot_enabled boolean not null default true/);
  assert.match(migration, /response_tone text not null default 'friendly'/);
  assert.match(migration, /alter table restaurant_whatsapp_bot_settings enable row level security/);
  assert.match(migration, /members manage restaurant whatsapp bot settings/);
  assert.match(service, /DEFAULT_WHATSAPP_BOT_SETTINGS/);
  assert.match(service, /saveBotSettings/);
  assert.match(client, /saveWhatsAppBotSettingsAction/);
  assert.match(client, /Configurar bot de WhatsApp/);
  assert.match(client, /BotSettingsModal/);
  assert.match(actions, /botSettingsSchema/);
  assert.match(actions, /botSaved/);
});

test("WhatsApp webhook uses bot settings only for safe response copy", async () => {
  const source = await readFile(webhookPath, "utf8");

  assert.match(source, /getWhatsAppBotSettings/);
  assert.match(source, /restaurant_whatsapp_bot_settings/);
  assert.match(source, /handoffIfBotDisabled/);
  assert.match(source, /menuIntroCopy/);
  assert.match(source, /checkoutIntroCopy/);
  assert.match(source, /sendConfiguredLocationRequest/);
  assert.match(source, /qrPaymentCopy/);
  assert.match(source, /receiptRequestCopy/);
  assert.match(source, /fallbackCopy/);
  assert.match(source, /create_public_order_transaction/);
});

test("WhatsApp has superadmin global settings before restaurant selection", async () => {
  const [migration, webhook, service, page, client, shell, restaurantCrm] = await Promise.all([
    readFile(platformSettingsMigrationPath, "utf8"),
    readFile(webhookPath, "utf8"),
    readFile(platformServicePath, "utf8"),
    readFile(platformPagePath, "utf8"),
    readFile(platformClientPath, "utf8"),
    readFile(adminShellPath, "utf8"),
    readFile(crmClientPath, "utf8"),
  ]);

  assert.match(migration, /create table if not exists platform_whatsapp_settings/);
  assert.match(migration, /draft_timeout_minutes integer not null default 20/);
  assert.match(migration, /superadmin manages platform whatsapp settings/);
  assert.match(webhook, /getPlatformWhatsAppSettings/);
  assert.match(webhook, /platformRestaurantPickerCopy/);
  assert.match(webhook, /platformFallbackCopy/);
  assert.match(webhook, /platformSettings\.draftTimeoutMinutes/);
  assert.match(service, /platformWhatsAppService/);
  assert.match(service, /saveSettings/);
  assert.match(page, /PlatformWhatsAppSettingsClient/);
  assert.match(client, /Mensajes globales/);
  assert.match(client, /Los nombres de locales salen automaticamente desde cada ficha/);
  assert.match(shell, /WhatsApp global/);
  assert.match(restaurantCrm, /Dejalo vacio para usar el saludo automatico con el nombre del local/);
  assert.doesNotMatch(restaurantCrm, /placeholder="Hola, soy el asistente de \{\{restaurant\}\}/);
});

test("WhatsApp platform catalog supports conversational category and promotion search", async () => {
  const source = await readFile(webhookPath, "utf8");

  assert.match(source, /GLOBAL_SEARCH:pizza/);
  assert.match(source, /GLOBAL_SEARCH:promociones/);
  assert.match(source, /BROWSE_RESTAURANTS/);
  assert.match(source, /GLOBAL_PRODUCT:\$\{item\.restaurant\.id\}:\$\{item\.product\.id\}/);
  assert.match(source, /listGlobalCatalogProducts/);
  assert.match(source, /searchGlobalCatalog/);
  assert.match(source, /parseGlobalCatalogSearchInput/);
  assert.match(source, /promos de pollo/);
  assert.match(source, /isPromotionProduct/);
  assert.match(source, /categoryName/);
  assert.match(source, /restaurant_id,name,price,category_id/);
});

test("WhatsApp bot refuses sensitive and off-topic AI prompts", async () => {
  const source = await readFile(webhookPath, "utf8");

  assert.match(source, /whatsAppSafetyBlockReason/);
  assert.match(source, /sendWhatsAppSafetyBlock/);
  assert.match(source, /sensitive_request/);
  assert.match(source, /off_topic/);
  assert.match(source, /codigo interno/);
  assert.match(source, /credenciales/);
  assert.match(source, /datos de usuarios/);
  assert.match(source, /instrucciones internas/);
  assert.match(source, /prompt interno/);
  assert.match(source, /hasWhatsAppOrderingSignal/);
  assert.match(source, /Solo puedo ayudarte con restaurantes, menus, promociones, pedidos y seguimiento/);
});

test("WhatsApp product images use JPEG-compatible cached assets", async () => {
  const [migration, storage, actions, webhook] = await Promise.all([
    readFile(whatsappProductImagesMigrationPath, "utf8"),
    readFile(publicStoragePath, "utf8"),
    readFile(adminActionsPath, "utf8"),
    readFile(webhookPath, "utf8"),
  ]);

  assert.match(migration, /add column if not exists whatsapp_image_url text/);
  assert.match(storage, /import sharp from "sharp"/);
  assert.match(storage, /uploadPublicWhatsAppImage/);
  assert.match(storage, /type: "image\/jpeg"/);
  assert.match(storage, /\.jpeg\(\{ quality, mozjpeg: true \}\)/);
  assert.match(actions, /uploadPublicWhatsAppImage\(imageFile/);
  assert.match(actions, /whatsapp_image_url: whatsappImageUrl/);
  assert.match(webhook, /whatsapp_image_url/);
  assert.match(webhook, /product\.whatsapp_image_url \?\? product\.image_url/);
  assert.match(webhook, /pathname\.endsWith\("\.jpg"\)[\s\S]*pathname\.endsWith\("\.jpeg"\)[\s\S]*pathname\.endsWith\("\.png"\)/);
});

test("WhatsApp can repeat owned orders with current catalog validation", async () => {
  const source = await readFile(webhookPath, "utf8");

  assert.match(source, /isRepeatOrderIntent/);
  assert.match(source, /REPEAT_ORDER:/);
  assert.match(source, /repeatPreviousOrder/);
  assert.match(source, /customer_phone_normalized/);
  assert.match(source, /revalidateDraftItems/);
  assert.match(source, /\.eq\("is_available", true\)/);
  assert.match(source, /assertDraftItemsInStock/);
  assert.match(source, /requiredByInventoryItem/);
  assert.match(source, /precios actuales/);
  assert.match(source, /No se enviara sin tu confirmacion/);
});

test("WhatsApp manages only the current customer's saved addresses with confirmation", async () => {
  const source = await readFile(webhookPath, "utf8");

  assert.match(source, /isOwnAddressesIntent/);
  assert.match(source, /ACTION_ADDRESSES/);
  assert.match(source, /findCustomerProfileByPhone/);
  assert.match(source, /phone_normalized/);
  assert.match(source, /ADDRESS_MANAGE:/);
  assert.match(source, /confirm_delete_address:/);
  assert.match(source, /CONFIRM_DELETE_ADDRESS:/);
  assert.match(source, /\.delete\(\)\.eq\("id", addressId\)\.eq\("customer_id", profile\.id\)/);
  assert.match(source, /Esta accion no se puede deshacer/);
});

test("WhatsApp restart keeps restaurant conversations visible in CRM", async () => {
  const source = await readFile(webhookPath, "utf8");

  assert.match(source, /restartDraftForCurrentRestaurant/);
  assert.match(source, /draft_restarted/);
  assert.match(source, /await updateConversationState\(supabase, conversation\.id, "browsing_menu", "draft_restarted", row\.message_id\)/);
  assert.match(source, /await sendRestaurantMenuIntro\(supabase, row\.from_phone, restaurant, await listTopProducts\(supabase, restaurant\.id\)\)/);
});

test("WhatsApp completed and stale drafts return to restaurant selection", async () => {
  const source = await readFile(webhookPath, "utf8");
  const resetBlock = source.match(/async function resetConversationForRestaurantSelection[\s\S]*?async function updateConversationState/)?.[0] ?? "";

  assert.match(source, /const DEFAULT_DRAFT_TIMEOUT_MINUTES = 20/);
  assert.match(source, /settings\.draftTimeoutMinutes \* 60 \* 1000/);
  assert.match(source, /platformSettings\.draftTimeoutMinutes/);
  assert.match(source, /created_order_id,updated_at/);
  assert.match(source, /expireStaleOpenDraftIfNeeded/);
  assert.match(source, /isOpenDraftExpired/);
  assert.match(source, /status: "abandoned"/);
  assert.match(source, /draft_expired/);
  assert.match(source, /Tu pedido anterior quedo pausado mas de/);
  assert.match(source, /await resetConversationForRestaurantSelection\(supabase, conversation\.id, "order_created", row\.message_id\)/);
  assert.match(source, /conversation\.state === "choosing_restaurant"/);
  assert.match(source, /resolveSelectedRestaurant\(supabase, \{ \.\.\.conversation, restaurant_id: null \}, command\.text\)/);
  assert.match(resetBlock, /state: "choosing_restaurant"/);
  assert.doesNotMatch(resetBlock, /restaurant_id/);
});

test("WhatsApp and settings support overnight business hours clearly", async () => {
  const [webhook, settingsClient] = await Promise.all([
    readFile(webhookPath, "utf8"),
    readFile(settingsClientPath, "utf8"),
  ]);

  assert.match(webhook, /opens > closes && minutes >= opens/);
  assert.match(webhook, /opens > closes && minutes <= closes/);
  assert.match(settingsClient, /Cruza medianoche: cierra al dia siguiente/);
  assert.match(settingsClient, /timeOptionLabel/);
  assert.match(settingsClient, /period = hour < 12 \? "a\.m\." : "p\.m\."/);
});
