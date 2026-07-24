import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

test("public orders use the transactional RPC and direct policies are revoked", () => {
  const action = read("src/app/r/actions.ts");
  const migration = read("supabase/migrations/0046_secure_transactional_public_orders.sql");

  assert.match(action, /rpc\("create_public_order_transaction"/);
  assert.doesNotMatch(action, /from\("orders"\)\s*\.insert/);
  assert.match(migration, /revoke insert on orders from anon, authenticated/i);
  assert.match(migration, /grant execute on function create_public_order_transaction[\s\S]+to service_role/i);
});

test("restaurant panels enforce membership before rendering", () => {
  const access = read("src/lib/services/restaurant-access.service.ts");
  const layout = read("src/components/layout/AdminLayout.tsx");
  const sessionCleanup = read("supabase/migrations/0049_remove_restaurant_session_write_lock.sql");
  const proxy = read("src/proxy.ts");
  const middleware = read("src/lib/supabase/middleware.ts");

  assert.match(access, /const accessClient = createAdminClient\(\) \?\? supabase/);
  assert.match(access, /if \(!restaurant \|\| \(!isSuperadmin && !membership\)\)[\s\S]+redirect\("\/admin\/login\?error=no-access"\)/);
  assert.match(access, /restaurant-access-authorized-without-monitoring/);
  assert.match(sessionCleanup, /drop trigger if exists enforce_single_restaurant_access_/);
  assert.doesNotMatch(sessionCleanup, /restaurant-session-required/);
  assert.match(layout, /memberships\.some\(\(membership\) => membership\.restaurantId === restaurantId\)/);
  assert.match(proxy, /export async function proxy/);
  assert.match(middleware, /NextResponse\.redirect\(loginUrl\)/);
});

test("restaurant and branch provisioning inspect setup failures", () => {
  const actions = read("src/app/admin/actions.ts");

  assert.match(actions, /const failedSetup = setupResults\.find/);
  assert.match(actions, /throwIfSupabaseError\([\s\S]+"branch-memberships"/);
  assert.match(actions, /await admin\.auth\.admin\.deleteUser\(branchUser\.user\.id\)/);
});

test("owner provisioning recovers orphaned Auth users without accepting real duplicates", () => {
  const actions = read("src/app/admin/actions.ts");

  assert.match(actions, /async function authUserHasBusinessReferences/);
  assert.match(actions, /if \(await authUserHasBusinessReferences\(admin, recoveredUser\.id\)\)/);
  assert.match(actions, /admin\.auth\.admin\.updateUserById\(ownerUserId/);
  assert.doesNotMatch(actions, /if \(!recoveredUser\?\.id \|\| message\.includes\("already"\)\)/);
});

test("owner capacity requests have owner and superadmin workflows", () => {
  const ownerPage = read("src/app/dueno/soporte/page.tsx");
  const accountPage = read("src/app/admin/restaurantes/[restaurantId]/cuenta/page.tsx");

  assert.match(ownerPage, /requestOwnerBranchCapacityAction/);
  assert.match(accountPage, /resolveOwnerBranchCapacityAction/);
});

test("saved restaurant theme colors are mapped to the public theme", () => {
  const service = read("src/lib/services/restaurant.service.ts");

  assert.match(service, /const primaryColor = normalizeBrandPrimary\(row\.primary_color\)/);
  assert.match(service, /backgroundColor: row\.background_color/);
});

test("remote database denies anonymous order writes and internal RPCs", async (context) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    context.skip("Supabase public environment is not configured");
    return;
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const [{ error: insertError }, { error: rpcError }] = await Promise.all([
    supabase.from("orders").insert({
      restaurant_id: crypto.randomUUID(),
      order_number: `SEC-${Date.now()}`,
      order_type: "pickup",
      order_origin: "web_checkout",
      payment_method: "cash",
    }),
    supabase.rpc("create_public_order_transaction", {
      p_request_id: crypto.randomUUID(),
      p_order: {},
      p_items: [],
    }),
  ]);

  assert.ok(insertError, "anonymous users must not insert orders directly");
  assert.ok(rpcError, "anonymous users must not execute the transactional order RPC");
});

test("remote critical migrations and service-only rate limiter are available", async (context) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    context.skip("Supabase service environment is not configured");
    return;
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const [entitlements, requests, productScheduling, optionInventory, invalidOrder] = await Promise.all([
    supabase.from("owner_branch_entitlements").select("owner_user_id", { head: true, count: "exact" }),
    supabase.from("owner_branch_capacity_requests").select("id", { head: true, count: "exact" }),
    supabase.from("products").select("product_kind,compare_at_price,available_days,available_start_time,available_end_time", { head: true, count: "exact" }),
    supabase.from("product_options").select("inventory_item_id,inventory_quantity,inventory_waste_factor", { head: true, count: "exact" }),
    supabase.rpc("create_public_order_transaction", {
      p_request_id: crypto.randomUUID(),
      p_order: { restaurant_id: crypto.randomUUID() },
      p_items: [{ product_id: crypto.randomUUID(), product_name: "Test", variant_id: null, option_ids: [], unit_price: 1, quantity: 1, subtotal: 1 }],
    }),
  ]);

  assert.equal(entitlements.error, null);
  assert.equal(requests.error, null);
  assert.equal(productScheduling.error, null);
  assert.equal(optionInventory.error, null);
  assert.ok(invalidOrder.error, "invalid service-role orders must still be rejected by database validation");

  const identifier = `test-${crypto.randomUUID()}`;
  const { data: allowed, error: rateError } = await supabase.rpc("consume_request_rate_limit", {
    p_scope: "automated-test",
    p_identifier_hash: identifier,
    p_max_attempts: 2,
    p_window_seconds: 60,
    p_block_seconds: 60,
  });
  assert.equal(rateError, null);
  assert.equal(allowed, true);
  await supabase.rpc("clear_request_rate_limit", { p_scope: "automated-test", p_identifier_hash: identifier });
});
