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
  const qrToggleMigration = read("supabase/migrations/0061_delivery_qr_prepayment_toggle.sql");
  const refundMigration = read("supabase/migrations/0052_atomic_order_refunds.sql");
  const ownerDashboard = read("src/lib/services/owner-dashboard.service.ts");

  assert.match(action, /resolveDeliveryPolicy/);
  assert.match(action, /qr-required-distance/);
  assert.match(action, /delivery_qr_prepayment_enabled/);
  assert.doesNotMatch(action, /has_open_cash_session_public/);
  assert.match(policy, /DEFAULT_QR_PREPAYMENT_DISTANCE_KM = 5/);
  assert.match(policy, /qrPrepaymentEnabled && distanceKm != null && distanceKm >= safeFarDistance/);
  assert.doesNotMatch(migration, /from cash_sessions/);
  assert.match(migration, /orders_validate_status_transition/);
  assert.match(qrToggleMigration, /delivery_qr_prepayment_enabled boolean not null default true/);
  assert.match(qrToggleMigration, /alter column far_delivery_distance_km set default 5/);
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

test("owner branch activation ignores archived restaurants but counts non-archived slots", () => {
  const actions = read("src/app/admin/actions.ts");
  const ownerDashboard = read("src/lib/services/owner-dashboard.service.ts");
  const ownerPage = read("src/app/dueno/page.tsx");
  const ownerForm = read("src/components/restaurants/OwnerRestaurantCreateFormClient.tsx");

  assert.match(actions, /\.in\("id", membershipRestaurantIds\)[\s\S]+\.is\("deleted_at", null\)[\s\S]+return restaurantFormError\(formData, "restaurant-exists"\)/);
  assert.match(actions, /return \{ used: nonArchivedRestaurantIds\.length, limit \}/);
  assert.match(ownerDashboard, /const remaining = Math\.max\(0, limit - nonArchived\)/);
  assert.match(ownerPage, /activation\.nonArchived > 0 \? "expansion" : "first"/);
  assert.match(ownerForm, /sucursal no archivada/);
});

test("owner account billing has monthly proof and superadmin approval", () => {
  const migration = read("supabase/migrations/0060_owner_account_platform_billing.sql");
  const service = read("src/lib/services/owner-billing.service.ts");
  const ownerPlan = read("src/app/dueno/plan/page.tsx");
  const accountPage = read("src/app/admin/restaurantes/[restaurantId]/cuenta/page.tsx");
  const actions = read("src/app/admin/actions.ts");
  const settingsClient = read("src/components/settings/RestaurantSettingsFormClient.tsx");
  const adminLayout = read("src/components/layout/AdminLayout.tsx");

  assert.match(migration, /owner_platform_billing_settings/);
  assert.match(migration, /owner_platform_payment_cycles/);
  assert.match(migration, /owners read account payment cycles/);
  assert.match(migration, /superadmin manages account payment cycles/);
  assert.match(service, /suspendOwnerRestaurantsForBilling/);
  assert.match(service, /reactivateOwnerRestaurantsAfterPayment/);
  assert.match(service, /\.eq\("status", "active"\)[\s\S]+\.is\("deleted_at", null\)/);
  assert.match(service, /\.is\("deactivated_by", null\)[\s\S]+\.is\("deleted_at", null\)/);
  assert.match(ownerPlan, /submitOwnerBillingPaymentProofAction/);
  assert.match(accountPage, /approveOwnerBillingPaymentAction/);
  assert.match(accountPage, /variant=\{nextAccountStatus === "active" \? "primary" : "danger"\}/);
  assert.match(actions, /restaurant\?\.status === "suspended" && !restaurant\.deactivated_by/);
  assert.doesNotMatch(settingsClient, /key: "plataforma"/);
  assert.doesNotMatch(settingsClient, /key: "operacion"/);
  assert.doesNotMatch(settingsClient, /Cobro de plataforma/);
  assert.doesNotMatch(settingsClient, /Subir comprobante/);
  assert.doesNotMatch(adminLayout, /platformBillingService/);
  assert.doesNotMatch(adminLayout, /billingAlert/);
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

test("payment settings are owner-only and invoice requests are filterable", () => {
  const actions = read("src/app/admin/actions.ts");
  const settingsPage = read("src/app/admin/restaurantes/[restaurantId]/configuracion/page.tsx");
  const settingsClient = read("src/components/settings/RestaurantSettingsFormClient.tsx");
  const qrViewer = read("src/components/payments/QrPaymentViewer.tsx");
  const orderService = read("src/lib/services/order.service.ts");
  const publicActions = read("src/app/r/actions.ts");
  const restaurantService = read("src/lib/services/restaurant.service.ts");
  const publicOrder = read("src/components/public-menu/PublicRestaurantOrderClient.tsx");
  const tableOrder = read("src/components/tables/TableOrderClient.tsx");
  const pos = read("src/components/cash/POSProductGrid.tsx");
  const cashPage = read("src/app/admin/restaurantes/[restaurantId]/caja/page.tsx");
  const ownerPlan = read("src/app/dueno/plan/page.tsx");
  const ownerSupport = read("src/app/dueno/soporte/page.tsx");
  const adminSupport = read("src/app/admin/soporte/page.tsx");
  const accountPage = read("src/app/admin/restaurantes/[restaurantId]/cuenta/page.tsx");

  assert.match(actions, /const canManageOwnerSettings = isSuperadmin \|\| currentRestaurant\.owner_user_id === user\.id/);
  assert.match(actions, /const canManagePayments = canManageOwnerSettings/);
  assert.match(actions, /returnTab === "pagos" && !canManagePayments/);
  assert.match(actions, /const qrPaymentUrl = canManagePayments[\s\S]+currentSettings\?\.qr_payment_url/);
  assert.match(actions, /const paymentSettings = canManagePayments/);
  assert.match(actions, /normalizeQrPaymentUrl\(settings\?\.qr_payment_url\)/);
  assert.match(actions, /function invoiceConfigurationPath/);
  assert.match(settingsPage, /normalizeInvoiceDateFilter/);
  assert.match(settingsPage, /orderService\.listInvoiceRequests\(restaurant\.id, invoiceFilters\)/);
  assert.match(settingsPage, /canManagePayments=\{canManageOwnerSettings\}/);
  assert.match(settingsClient, /canManagePayments: boolean/);
  assert.match(settingsClient, /Pagos y factura/);
  assert.match(settingsClient, /invoiceFilterHref/);
  assert.match(settingsClient, /name="invoiceFrom" type="hidden"/);
  assert.match(settingsClient, /QrPaymentViewer/);
  assert.match(qrViewer, /Ver grande/);
  assert.match(qrViewer, /Descargar/);
  assert.match(qrViewer, /URL\.createObjectURL/);
  assert.match(qrViewer, /window\.open\(normalizedUrl/);
  assert.match(orderService, /async listInvoiceRequests\([\s\S]+filters:/);
  assert.match(orderService, /\.is\("invoice_issued_at", null\)/);
  assert.match(orderService, /\.not\("invoice_issued_at", "is", null\)/);
  assert.match(orderService, /businessDateBoundaryIso/);
  assert.match(publicActions, /if \(parsed\.data\.invoiceRequired && !settings\.invoice_enabled\)/);
  assert.match(publicActions, /normalizeQrPaymentUrl\(settings\.qr_payment_url\)/);
  assert.match(restaurantService, /async getPublicSettings/);
  assert.match(restaurantService, /const admin = createAdminClient\(\)/);
  assert.match(publicOrder, /hasQrPaymentConfigured\(settings\)/);
  assert.match(publicOrder, /QR activo para esta sucursal/);
  assert.match(publicOrder, /QrPaymentViewer/);
  assert.match(tableOrder, /hasQrPaymentConfigured\(settings\)/);
  assert.match(tableOrder, /disabled=\{!qrAvailable\}/);
  assert.match(tableOrder, /QrPaymentViewer/);
  assert.match(tableOrder, /settings\?\.invoiceEnabled/);
  assert.match(tableOrder, /name="invoiceRequired" type="hidden"/);
  assert.match(tableOrder, /name="invoiceDocumentType"/);
  assert.match(tableOrder, /name="invoiceDocumentNumber"/);
  assert.match(tableOrder, /name="invoiceName"/);
  assert.match(tableOrder, /error === "invoice"/);
  assert.match(pos, /settings: RestaurantSettings \| null/);
  assert.match(pos, /QR \{qrAvailable \? "activo" : "sin configurar"\}/);
  assert.match(pos, /QrPaymentViewer/);
  assert.match(cashPage, /restaurantService\.getSettings\(restaurant\.id\)/);
  assert.match(ownerPlan, /QrPaymentViewer/);
  assert.match(ownerSupport, /QrPaymentViewer/);
  assert.match(adminSupport, /QrPaymentViewer/);
  assert.match(accountPage, /QrPaymentViewer/);
});

test("delivery pricing lives in its own owner-only delivery tab", () => {
  const actions = read("src/app/admin/actions.ts");
  const settingsPage = read("src/app/admin/restaurantes/[restaurantId]/configuracion/page.tsx");
  const settingsClient = read("src/components/settings/RestaurantSettingsFormClient.tsx");
  const publicOrder = read("src/components/public-menu/PublicRestaurantOrderClient.tsx");

  assert.match(settingsPage, /canManageDeliverySettings=\{canManageOwnerSettings\}/);
  assert.match(settingsClient, /canManageDeliverySettings: boolean/);
  assert.match(settingsClient, /key: "delivery"/);
  assert.match(settingsClient, /activeTab === "delivery"/);
  assert.match(settingsClient, /Aceptar pedidos delivery/);
  assert.match(settingsClient, /Estado y costos/);
  assert.match(settingsClient, /Seguridad del pedido/);
  assert.match(settingsClient, /Pedir QR obligatorio por distancia/);
  assert.match(settingsClient, /name="deliveryFee"/);
  assert.match(settingsClient, /name="deliveryQrPrepaymentEnabled"/);
  assert.match(settingsClient, /name="freeDeliveryFrom"/);
  assert.match(settingsClient, /Envio gratis/);
  assert.match(settingsClient, /disabled=\{!canManageDeliverySettings\}/);
  assert.doesNotMatch(settingsClient, /Pagos y factura[\s\S]{0,900}name="deliveryFee"/);
  assert.doesNotMatch(settingsClient, /activeTab === "ubicacion"[\s\S]{0,900}Estado y costos/);
  assert.match(actions, /const canManageDeliverySettings = canManageOwnerSettings/);
  assert.match(actions, /const canWriteDeliverySettings = canManageDeliverySettings && returnTab === "delivery"/);
  assert.match(actions, /const deliverySettings = canWriteDeliverySettings/);
  assert.match(actions, /deliveryEnabled: canWriteDeliverySettings \? parsed\.data\.deliveryEnabled/);
  assert.match(actions, /delivery_qr_prepayment_enabled: parsed\.data\.deliveryQrPrepaymentEnabled/);
  assert.match(actions, /await requireRestaurantOwnerOrSuperadmin\(parsed\.data\.restaurantId, `\/admin\/restaurantes\/\$\{parsed\.data\.restaurantId\}\/configuracion\?tab=delivery`\)/);
  assert.match(publicOrder, /deliveryFeeLabel/);
  assert.match(publicOrder, /Envio gratis/);
});

test("catalog availability days do not turn an empty form value into Sunday-only products", () => {
  const actions = read("src/app/admin/actions.ts");
  const productClient = read("src/components/products/ProductManagementClient.tsx");
  const publicPage = read("src/app/r/[restaurantSlug]/page.tsx");
  const publicOrder = read("src/components/public-menu/PublicRestaurantOrderClient.tsx");
  const tableOrder = read("src/components/tables/TableOrderClient.tsx");

  assert.match(actions, /String\(value \?\? ""\)[\s\S]+\.map\(\(item\) => item\.trim\(\)\)[\s\S]+\.filter\(Boolean\)[\s\S]+\.map\(\(item\) => Number\(item\)\)/);
  assert.match(actions, /async function revalidateRestaurantCatalogPaths/);
  assert.match(actions, /revalidatePath\(publicRestaurantPath\(restaurantSlug\)\)/);
  assert.match(actions, /revalidatePath\(`\/r\/\$\{restaurantSlug\}`\)/);
  assert.match(productClient, />\s*Todos\s*<\/button>/);
  assert.match(productClient, /<input name="availableFrom" type="hidden" value=\{availableFromValue\}/);
  assert.match(productClient, /<input name="availableUntil" type="hidden" value=\{availableUntilValue\}/);
  assert.match(productClient, /ScheduleDateTimeField/);
  assert.match(productClient, /ScheduleCalendarDropdown/);
  assert.match(productClient, /calendarDaysForMonth/);
  assert.match(productClient, /Hora inicio diaria \(24h\)/);
  assert.doesNotMatch(productClient, /datetime-local|type="time"|type="date"/);
  assert.match(actions, /function validateProductScheduleInput/);
  assert.match(actions, /schedule-past/);
  assert.match(actions, /schedule-order/);
  assert.match(actions, /time-order/);
  assert.match(actions, /\^\(\[01\]\\d\|2\[0-3\]\):\[0-5\]\\d\$/);
  assert.match(publicOrder, /productAvailabilityLabels\(product\)/);
  assert.match(tableOrder, /productAvailabilityLabels\(product\)/);
  assert.match(publicPage, /export const dynamic = "force-dynamic"/);
  assert.doesNotMatch(publicPage, /PUBLIC_RESTAURANT_PAGE_TTL_MS|publicRestaurantPageCache/);
});

test("configurable products require an explicit variant before ordering", () => {
  const actions = read("src/app/r/actions.ts");
  const publicOrder = read("src/components/public-menu/PublicRestaurantOrderClient.tsx");
  const tableOrder = read("src/components/tables/TableOrderClient.tsx");
  const pos = read("src/components/cash/POSProductGrid.tsx");

  assert.match(actions, /resolvedCart = await resolvePublicCartItems\(writeClient, parsed\.data\.restaurantId, parsed\.data\.cart\)/);
  assert.match(actions, /if \(!item\.variantId && \(activeVariantsByProduct\.get\(item\.productId\)\?\.length \?\? 0\) > 0\)/);
  assert.match(publicOrder, /const \[variantId, setVariantId\] = useState\(""\)/);
  assert.match(tableOrder, /const \[variantId, setVariantId\] = useState\(""\)/);
  assert.match(pos, /const \[variantId, setVariantId\] = useState\(""\)/);
  assert.match(publicOrder, /const canAdd = \(!variants\.length \|\| Boolean\(selectedVariant\)\) &&/);
  assert.match(tableOrder, /const canAdd = \(!variants\.length \|\| Boolean\(selectedVariant\)\) &&/);
  assert.match(pos, /const canAdd = \(!variants\.length \|\| Boolean\(selectedVariant\)\) &&/);
  assert.match(publicOrder, /setVariantId\(\(current\) => \(current === variant\.id \? "" : variant\.id\)\)/);
  assert.match(tableOrder, /setVariantId\(\(current\) => \(current === variant\.id \? "" : variant\.id\)\)/);
  assert.match(pos, /setVariantId\(\(current\) => \(current === variant\.id \? "" : variant\.id\)\)/);
  assert.match(tableOrder, /error === "product-configuration"/);
});

test("public home requests location and promotes nearest branches first", () => {
  const home = read("src/app/page.tsx");
  const nearbyDirectory = read("src/components/home/HomeNearbyDirectory.tsx");
  const search = read("src/components/home/HomeSearchAutocomplete.tsx");
  const userLocation = read("src/lib/client/user-location.ts");

  assert.match(home, /HomeLocationProvider restaurants=\{baseDirectory\.restaurants\}/);
  assert.match(home, /HomeNearestBranchSpotlight restaurants=\{baseDirectory\.restaurants\}/);
  assert.match(nearbyDirectory, /export function HomeNearestBranchSpotlight/);
  assert.match(nearbyDirectory, /requestLocation\(\)/);
  assert.match(nearbyDirectory, /rankRestaurantCards\(restaurants, userLocation\)\.filter/);
  assert.match(nearbyDirectory, /formatDistance\(closest\.distanceKm/);
  assert.match(search, /distanceKm: restaurantDistanceKm\(userPosition, card\)/);
  assert.match(userLocation, /function isValidCoordinate/);
});

test("panel actions provide navigation feedback and no destructive restaurant delete UI", () => {
  const navigation = read("src/components/layout/NavigationFeedback.tsx");
  const submitButton = read("src/components/ui/FormSubmitButton.tsx");
  const restoration = read("src/app/admin/restauracion/page.tsx");
  const restaurantsPage = read("src/app/admin/restaurantes/page.tsx");

  assert.match(navigation, /form\.dataset\.yopidoSubmitting === "true"/);
  assert.match(navigation, /document\.documentElement\.dataset\.yopidoBusy = "true"/);
  assert.match(submitButton, /variant\?: ComponentProps<typeof Button>\["variant"\]/);
  assert.doesNotMatch(restoration, /permanentlyDeleteRestaurantAction|Eliminar definitivo|Trash2/);
  assert.match(restaurantsPage, /Archivados/);
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
    supabase.from("restaurant_settings").select("far_delivery_distance_km,delivery_qr_prepayment_enabled", { head: true, count: "exact" }),
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
