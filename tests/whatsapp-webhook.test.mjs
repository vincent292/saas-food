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
  assert.match(source, /Responde copiando este formato/);
  assert.match(source, /🛵 Entrega: \$\{settings\.delivery_enabled/);
  assert.match(source, /👤 Cliente: Juan Perez/);
  assert.match(source, /Hora: ahora, 19:30 o 28\/08\/2026 19:30/);
  assert.match(source, /stripCheckoutLinePrefix/);
  assert.doesNotMatch(source, /recojo \| ahora \| Tu nombre/);
});

test("WhatsApp delivery distance can force QR after location is calculated", async () => {
  const source = await readFile(webhookPath, "utf8");

  assert.match(source, /deliveryPolicy\?\.requiresQrPrepayment && paymentMethod !== "qr"/);
  assert.match(source, /paymentMethod = "qr"/);
  assert.match(source, /sendQrPaymentInstructions/);
  assert.match(source, /receipt-required/);
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
