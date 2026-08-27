import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const webhookPath = new URL("../supabase/functions/whatsapp-webhook/index.ts", import.meta.url);
const migrationPath = new URL("../supabase/migrations/0085_whatsapp_order_checkout.sql", import.meta.url);
const botSettingsMigrationPath = new URL("../supabase/migrations/0087_restaurant_whatsapp_bot_settings.sql", import.meta.url);
const whatsappReceiptRoutePath = new URL("../src/app/api/storage/whatsapp-receipts/[...key]/route.ts", import.meta.url);
const privateReceiptRoutePath = new URL("../src/app/api/storage/private/[...key]/route.ts", import.meta.url);
const receiptViewerPath = new URL("../src/components/payments/ReceiptViewerButton.tsx", import.meta.url);
const crmServicePath = new URL("../src/lib/services/whatsapp-crm.service.ts", import.meta.url);
const crmClientPath = new URL("../src/components/whatsapp/WhatsAppCrmClient.tsx", import.meta.url);
const crmActionsPath = new URL("../src/app/admin/restaurantes/[restaurantId]/whatsapp/actions.ts", import.meta.url);
const settingsClientPath = new URL("../src/components/settings/RestaurantSettingsFormClient.tsx", import.meta.url);

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
  assert.match(source, /customer_address: savedAddress\.address/);
  assert.match(source, /delivery_latitude: savedAddress\.latitude/);
  assert.match(source, /await continueAfterCompactCheckout\(supabase, row, conversation, updated, true\)/);
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

test("WhatsApp restart keeps restaurant conversations visible in CRM", async () => {
  const source = await readFile(webhookPath, "utf8");

  assert.match(source, /restartDraftForCurrentRestaurant/);
  assert.match(source, /draft_restarted/);
  assert.match(source, /await updateConversationState\(supabase, conversation\.id, "browsing_menu", "draft_restarted", row\.message_id\)/);
  assert.match(source, /await sendRestaurantMenuIntro\(supabase, row\.from_phone, restaurant, await listTopProducts\(supabase, restaurant\.id\)\)/);
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
