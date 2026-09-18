import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("active rider polling renews availability and expired offers can be retried", async () => {
  const [dispatch, riderMobile, actions, panel] = await Promise.all([
    readFile(new URL("src/lib/services/rider-dispatch.service.ts", root), "utf8"),
    readFile(new URL("src/lib/services/rider-mobile.service.ts", root), "utf8"),
    readFile(new URL("src/app/admin/actions.ts", root), "utf8"),
    readFile(new URL("src/components/delivery/DeliveryDispatchPanel.tsx", root), "utf8"),
  ]);

  assert.match(dispatch, /const riderOfferTtlSeconds = 120/);
  assert.match(dispatch, /offer\.status === "pending" \|\| offer\.status === "accepted" \|\| offer\.status === "rejected"/);
  assert.doesNotMatch(dispatch, /offer\.status !== "cancelled"/);
  assert.match(riderMobile, /update\(\{ last_seen_at: new Date\(\)\.toISOString\(\) \}\)/);
  assert.match(riderMobile, /\.eq\("available_date", todayLaPazDate\(\)\)/);
  assert.match(riderMobile, /\.eq\("is_available", true\)/);
  assert.match(actions, /acepto el pedido y va rumbo al local/);
  assert.match(panel, /Rider aceptó/);
  assert.match(panel, /Yendo al local/);
});
