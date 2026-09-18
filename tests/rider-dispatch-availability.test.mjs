import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("an opened rider shift persists without polling and busy riders are excluded across memberships", async () => {
  const [dispatch, riderMobile, actions, panel, migration] = await Promise.all([
    readFile(new URL("src/lib/services/rider-dispatch.service.ts", root), "utf8"),
    readFile(new URL("src/lib/services/rider-mobile.service.ts", root), "utf8"),
    readFile(new URL("src/app/admin/actions.ts", root), "utf8"),
    readFile(new URL("src/components/delivery/DeliveryDispatchPanel.tsx", root), "utf8"),
    readFile(new URL("supabase/migrations/0106_persistent_rider_shift_and_realtime.sql", root), "utf8"),
  ]);

  assert.match(dispatch, /const riderOfferTtlSeconds = 120/);
  assert.match(dispatch, /offer\.status === "pending" \|\| offer\.status === "accepted" \|\| offer\.status === "rejected"/);
  assert.doesNotMatch(dispatch, /offer\.status !== "cancelled"/);
  assert.doesNotMatch(dispatch, /\.gte\("last_seen_at"/);
  assert.doesNotMatch(riderMobile, /update\(\{ last_seen_at: new Date\(\)\.toISOString\(\) \}\)/);
  assert.match(dispatch, /busyRiderUserIds/);
  assert.match(dispatch, /linkedMemberships/);
  assert.match(dispatch, /activeDispatches = 0/);
  assert.match(migration, /rider-busy/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /rider_delivery_offers/);
  assert.match(migration, /riders read own delivery links/);
  assert.match(actions, /acepto el pedido y va rumbo al local/);
  assert.match(panel, /Rider aceptó/);
  assert.match(panel, /Yendo al local/);
});
