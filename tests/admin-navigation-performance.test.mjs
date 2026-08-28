import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("restaurant modules share one persistent admin shell", async () => {
  const [layout, shell, ordersPage, cashPage, inventoryPage] = await Promise.all([
    readFile(new URL("src/app/admin/restaurantes/[restaurantId]/layout.tsx", root), "utf8"),
    readFile(new URL("src/components/layout/AdminShellClient.tsx", root), "utf8"),
    readFile(new URL("src/app/admin/restaurantes/[restaurantId]/pedidos/page.tsx", root), "utf8"),
    readFile(new URL("src/app/admin/restaurantes/[restaurantId]/caja/page.tsx", root), "utf8"),
    readFile(new URL("src/app/admin/restaurantes/[restaurantId]/inventario/page.tsx", root), "utf8"),
  ]);

  assert.match(layout, /<AdminLayout/);
  assert.match(layout, /modulesForAdminLayout\(restaurant\)/);
  assert.match(shell, /usePathname\(\)/);
  assert.match(shell, /router\.prefetch\(href\)/);
  assert.match(shell, /pendingNavigation/);
  assert.doesNotMatch(`${ordersPage}\n${cashPage}\n${inventoryPage}`, /<AdminLayout|claimOrRedirect/);
});

test("navigation feedback stays non-blocking and server functions run near Supabase", async () => {
  const [feedback, vercelConfig] = await Promise.all([
    readFile(new URL("src/components/layout/NavigationFeedback.tsx", root), "utf8"),
    readFile(new URL("vercel.json", root), "utf8"),
  ]);

  assert.match(feedback, /pointer-events-none fixed inset-x-0 top-0/);
  assert.doesNotMatch(feedback, /fixed inset-0[^\n]+backdrop-blur/);
  assert.deepEqual(JSON.parse(vercelConfig).regions, ["pdx1"]);
});

test("dashboard uses one aggregate query with a compatible fallback", async () => {
  const [dashboard, migration] = await Promise.all([
    readFile(new URL("src/components/admin/RestaurantDashboard.tsx", root), "utf8"),
    readFile(new URL("supabase/migrations/0094_fast_restaurant_dashboard_snapshot.sql", root), "utf8"),
  ]);

  assert.match(dashboard, /rpc\("get_restaurant_dashboard_snapshot"/);
  assert.match(dashboard, /Promise\.all\(\[/);
  assert.match(migration, /security definer/);
  assert.match(migration, /has_restaurant_role/);
  assert.match(migration, /grant execute[^\n]+authenticated/);
});
