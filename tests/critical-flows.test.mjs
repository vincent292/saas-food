import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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

test("phase one delivery policy allows city-wide orders and requires QR by distance", () => {
  const action = read("src/app/r/actions.ts");
  const policy = read("src/lib/delivery-policy.ts");
  const migration = read("supabase/migrations/0051_phase_one_delivery_and_order_rules.sql");
  const refundMigration = read("supabase/migrations/0052_atomic_order_refunds.sql");
  const ownerDashboard = read("src/lib/services/owner-dashboard.service.ts");

  assert.match(action, /resolveDeliveryPolicy/);
  assert.match(action, /qr-required-distance/);
  assert.doesNotMatch(action, /has_open_cash_session_public/);
  assert.match(policy, /requiresQrPrepayment:\s*distanceKm != null && distanceKm > safeFarDistance/);
  assert.doesNotMatch(migration, /from cash_sessions/);
  assert.match(migration, /orders_validate_status_transition/);
  assert.match(refundMigration, /create or replace function refund_order_atomic/);
  assert.match(refundMigration, /perform reverse_order_inventory_usage/);
  assert.match(ownerDashboard, /\.eq\("payment_status", "paid"\)/);
});

test("public ordering uses one canonical modal flow", () => {
  const legacyCheckoutRoute = read("src/app/r/[restaurantSlug]/checkout/page.tsx");
  const publicPage = read("src/app/r/[restaurantSlug]/page.tsx");
  const publicOrderClient = read("src/components/public-menu/PublicRestaurantOrderClient.tsx");

  assert.match(legacyCheckoutRoute, /redirect\(publicRestaurantOrderPath\(restaurantSlug, error\)\)/);
  assert.match(publicPage, /initialOrderOpen=\{pedido === "1" \|\| Boolean\(error\)\}/);
  assert.match(publicOrderClient, /useState\(initialOrderOpen\)/);
  assert.doesNotMatch(publicOrderClient, /25-35 min|Top picks para ti|data-product-modal-favorite/);
  assert.equal(existsSync(join(root, "src/components/public-menu/CheckoutClient.tsx")), false);
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

test("owner account billing has monthly proof and superadmin approval", () => {
  const migration = read("supabase/migrations/0060_owner_account_platform_billing.sql");
  const service = read("src/lib/services/owner-billing.service.ts");
  const ownerPlan = read("src/app/dueno/plan/page.tsx");
  const accountPage = read("src/app/admin/restaurantes/[restaurantId]/cuenta/page.tsx");

  assert.match(migration, /owner_platform_billing_settings/);
  assert.match(migration, /owner_platform_payment_cycles/);
  assert.match(migration, /owners read account payment cycles/);
  assert.match(migration, /superadmin manages account payment cycles/);
  assert.match(service, /suspendOwnerRestaurantsForBilling/);
  assert.match(service, /reactivateOwnerRestaurantsAfterPayment/);
  assert.match(ownerPlan, /submitOwnerBillingPaymentProofAction/);
  assert.match(accountPage, /approveOwnerBillingPaymentAction/);
});

test("catalog changes are owner-only while branches keep read access", () => {
  const actions = read("src/app/admin/actions.ts");
  const productsPage = read("src/app/admin/restaurantes/[restaurantId]/productos/page.tsx");
  const productClient = read("src/components/products/ProductManagementClient.tsx");
  const categoriesPage = read("src/app/admin/restaurantes/[restaurantId]/categorias/page.tsx");

  assert.match(actions, /async function requireRestaurantOwnerOrSuperadmin/);
  assert.match(actions, /await requireRestaurantOwnerOrSuperadmin\(parsed\.data\.restaurantId, returnPath\)/);
  assert.match(actions, /await requireRestaurantOwnerOrSuperadmin\(parsed\.data\.restaurantId, `\/admin\/restaurantes\/\$\{parsed\.data\.restaurantId\}\/productos`\)/);
  assert.match(productsPage, /canManageProducts=\{canManageProducts\}/);
  assert.match(productClient, /Catalogo en modo consulta/);
  assert.match(productClient, /onEdit=\{canManageProducts \? \(\) => openEditProductModal\(product\) : undefined\}/);
  assert.match(categoriesPage, /canManageCatalog/);
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
  const [entitlements, requests, productScheduling, optionInventory, deliveryRules, orderDeliveryRules, invalidOrder, refundRpc] = await Promise.all([
    supabase.from("owner_branch_entitlements").select("owner_user_id", { head: true, count: "exact" }),
    supabase.from("owner_branch_capacity_requests").select("id", { head: true, count: "exact" }),
    supabase.from("products").select("product_kind,compare_at_price,available_days,available_start_time,available_end_time", { head: true, count: "exact" }),
    supabase.from("product_options").select("inventory_item_id,inventory_quantity,inventory_waste_factor", { head: true, count: "exact" }),
    supabase.from("restaurant_settings").select("far_delivery_distance_km", { head: true, count: "exact" }),
    supabase.from("orders").select("delivery_distance_km,requires_prepayment", { head: true, count: "exact" }),
    supabase.rpc("create_public_order_transaction", {
      p_request_id: crypto.randomUUID(),
      p_order: { restaurant_id: crypto.randomUUID() },
      p_items: [{ product_id: crypto.randomUUID(), product_name: "Test", variant_id: null, option_ids: [], unit_price: 1, quantity: 1, subtotal: 1 }],
    }),
    supabase.rpc("refund_order_atomic", {
      p_restaurant_id: crypto.randomUUID(),
      p_order_id: crypto.randomUUID(),
      p_reason: "Automated availability check",
    }),
  ]);

  assert.equal(entitlements.error, null);
  assert.equal(requests.error, null);
  assert.equal(productScheduling.error, null);
  assert.equal(optionInventory.error, null);
  assert.equal(deliveryRules.error, null);
  assert.equal(orderDeliveryRules.error, null);
  assert.ok(invalidOrder.error, "invalid service-role orders must still be rejected by database validation");
  assert.ok(refundRpc.error, "refunds require an authenticated restaurant operator");
  assert.notEqual(refundRpc.error.code, "PGRST202", "refund RPC must exist in the remote schema");

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
