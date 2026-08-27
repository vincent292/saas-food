import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("restaurant operations use Supabase Realtime with disconnected-only fallback", async () => {
  const [hook, orders, kitchen, cash, dashboard] = await Promise.all([
    readFile(new URL("src/lib/client/use-restaurant-realtime-refresh.ts", root), "utf8"),
    readFile(new URL("src/components/orders/OrdersReceptionClient.tsx", root), "utf8"),
    readFile(new URL("src/components/kitchen/KitchenBoardClient.tsx", root), "utf8"),
    readFile(new URL("src/components/cash/CashWorkspaceClient.tsx", root), "utf8"),
    readFile(new URL("src/components/admin/RestaurantDashboard.tsx", root), "utf8"),
  ]);

  assert.match(hook, /postgres_changes/);
  assert.match(hook, /if \(!connectedRef\.current\)/);
  assert.match(hook, /60_000/);
  assert.match(orders, /scope: "orders"/);
  assert.match(kitchen, /scope: "kitchen"/);
  assert.match(cash, /scope: "cash"/);
  assert.match(dashboard, /scope="dashboard"/);
  assert.doesNotMatch(`${orders}\n${kitchen}\n${cash}`, /setInterval\(refreshFallback, 30000\)/);
});

test("public order, delivery, and group tracking broadcast only token-scoped change signals", async () => {
  const [migration, tracking, delivery, group] = await Promise.all([
    readFile(new URL("supabase/migrations/0091_realtime_operations.sql", root), "utf8"),
    readFile(new URL("src/components/orders/OrderTrackingLiveRefresh.tsx", root), "utf8"),
    readFile(new URL("src/app/delivery/[token]/page.tsx", root), "utf8"),
    readFile(new URL("src/components/group-orders/GroupOrderSessionClient.tsx", root), "utf8"),
  ]);

  assert.match(migration, /alter publication supabase_realtime add table/);
  assert.match(migration, /'order-tracking:' \|\| tracking_token/);
  assert.match(migration, /'delivery:' \|\| delivery_token/);
  assert.match(migration, /'group-order:' \|\| session_token/);
  assert.match(migration, /jsonb_build_object\('order_id', changed_order_id\)/);
  assert.doesNotMatch(migration, /customer_phone|customer_address|delivery_latitude/);
  assert.match(tracking, /useRealtimeBroadcast/);
  assert.match(delivery, /RealtimeBroadcastRefresh/);
  assert.match(group, /useRealtimeBroadcast/);
  assert.doesNotMatch(group, /OPEN_REFRESH_INTERVAL_MS|LOCKED_REFRESH_INTERVAL_MS/);
});
