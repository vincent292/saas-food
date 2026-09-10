import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), "utf8");
}

test("delivery confirmation codes replace token-only completion paths", async () => {
  const [migration, riderStatusRoute, riderMobileService, deliveryActions, deliveryPage, dispatchPanel, tracking] = await Promise.all([
    read("supabase/migrations/0095_delivery_confirmation_codes.sql"),
    read("src/app/api/mobile/riders/orders/[orderId]/status/route.ts"),
    read("src/lib/services/rider-mobile.service.ts"),
    read("src/app/delivery/actions.ts"),
    read("src/app/delivery/[token]/page.tsx"),
    read("src/components/delivery/DeliveryDispatchPanel.tsx"),
    read("src/components/orders/OrderTrackingLiveRefresh.tsx"),
  ]);

  assert.match(migration, /pickup_confirmation_code text default generate_delivery_confirmation_code\(\)/);
  assert.match(migration, /delivery_confirmation_code text default generate_delivery_confirmation_code\(\)/);
  assert.match(migration, /drop function if exists mark_delivery_order_arrived\(text\)/);
  assert.match(migration, /drop function if exists mark_delivery_order_delivered\(text\)/);
  assert.match(migration, /create or replace function mark_delivery_order_arrived\(p_delivery_token text, p_confirmation_code text\)/);
  assert.match(migration, /create or replace function mark_delivery_order_delivered\(p_delivery_token text, p_confirmation_code text\)/);
  assert.match(migration, /pickup_code_attempts >= 5/);
  assert.match(migration, /delivery_code_attempts >= 5/);
  assert.match(migration, /pickup-code-required/);

  assert.match(riderStatusRoute, /confirmationCode: z\.string\(\)\.regex\(/);
  assert.match(riderMobileService, /p_confirmation_code: confirmationCode/);
  assert.match(deliveryActions, /confirmationCode: formData\.get\("confirmationCode"\)/);
  assert.match(deliveryPage, /name="confirmationCode"/);
  assert.match(dispatchPanel, /Codigo de recogida/);
  assert.match(tracking, /Codigo de entrega/);
});
