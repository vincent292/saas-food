import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const webhookPath = new URL("../supabase/functions/whatsapp-webhook/index.ts", import.meta.url);
const migrationPath = new URL("../supabase/migrations/0085_whatsapp_order_checkout.sql", import.meta.url);
const receiptRoutePath = new URL("../src/app/api/storage/whatsapp-receipts/[...key]/route.ts", import.meta.url);

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
  const [migration, route] = await Promise.all([
    readFile(migrationPath, "utf8"),
    readFile(receiptRoutePath, "utf8"),
  ]);

  assert.match(migration, /add column if not exists checkout_step/);
  assert.match(migration, /add column if not exists pending_item jsonb/);
  assert.match(migration, /'whatsapp-payment-receipts'/);
  assert.match(migration, /false,\s*5242880/);
  assert.match(route, /global_role === "superadmin"/);
  assert.match(route, /restaurant_memberships/);
  assert.match(route, /createSignedUrl/);
});
