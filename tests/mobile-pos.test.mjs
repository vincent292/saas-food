import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = new URL("../", import.meta.url);
function load(path, mocks = {}) {
  const source = ts.transpileModule(readFileSync(new URL(path, root), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require: (name) => name in mocks ? mocks[name] : require(name), process, console, Request, Response, File, URL, crypto, Date, Intl });
  return exports;
}
const restaurantId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const productId = "33333333-3333-4333-8333-333333333333";
const tableId = "44444444-4444-4444-8444-444444444444";
const requestId = "55555555-5555-4555-8555-555555555555";
function clientFor(rows, user = { id: userId, user_metadata: {} }, operational = false) {
  return {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    rpc: async () => ({ data: "audit", error: null }),
    from(table) {
      let data = rows[table] ?? [], single = false, updateValues = null, insertValues = null, head = false;
      if (operational && table === "orders") data = data.filter(row => !row.bank_checkout_hold);
      const query = {
        select(_columns, options) { head = options?.head === true; return query; }, order() { return query; }, limit() { return query; },
        update(values) { updateValues = values; return query; },
        insert(values) { insertValues = Array.isArray(values) ? values : [values]; return query; },
        eq(key, value) { data = data.filter((r) => r[key] === value); return query; },
        is(key, value) { data = data.filter((r) => r[key] === value); return query; },
        in(key, values) { data = data.filter((r) => values.includes(r[key])); return query; },
        maybeSingle() { single = true; return query; }, single() { single = true; return query; },
        then(resolve) {
          if (updateValues) data.forEach((row) => Object.assign(row, updateValues));
          if (insertValues) (rows[table] ??= []).push(...insertValues);
          return Promise.resolve({ data: head ? null : single ? data[0] ?? null : data, count: head ? data.length : null, error: null }).then(resolve);
        },
      };
      return query;
    },
  };
}
function fixture(role = "waiter") {
  const rows = {
    profiles: [{ id: userId, full_name: "Ana Mesera", global_role: null }],
    restaurant_memberships: [{ user_id: userId, restaurant_id: restaurantId, role, is_active: true }],
    restaurants: [{ id: restaurantId, name: "Local de prueba", slug: "local", status: "active", deleted_at: null, business_type: "food" }],
    tables: [{ id: tableId, name: "Mesa 4", code: "M4", restaurant_id: restaurantId, is_active: true, status: "available" }],
    products: [{ id: productId, restaurant_id: restaurantId, name: "Almuerzo", price: 25, is_available: true }],
    product_variants: [], product_options: [], product_option_groups: [],
    restaurant_settings: [{ restaurant_id: restaurantId, table_orders_enabled: true, min_order_amount: 0, qr_payment_url: null }],
    business_hours: [], orders: [],
    admin_audit_logs: [{ actor_user_id: userId, restaurant_id: restaurantId, action: "waiter_shift_opened", created_at: new Date().toISOString() }],
  };
  const client = clientFor(rows, undefined, true), adminClient = clientFor(rows), calls = [], rpcCalls = [], backgroundCalls = [], notificationCalls = [], signedReceiptCalls = [];
  client.rpc = async (name, args) => {
    rpcCalls.push({ name, args });
    if (name === "charge_order_with_cash_movement") {
      const order = rows.orders.find((item) => item.id === args.p_order_id);
      if (order) {
        order.payment_status = "paid";
        if (order.status === "pending") order.status = "accepted";
      }
      return { data: args.p_order_id, error: null };
    }
    if (name === "update_operational_order_status") {
      const order = rows.orders.find((item) => item.id === args.p_order_id);
      if (order?.status === args.p_expected_status) order.status = args.p_next_status;
      return { data: order ? [{ status_changed: true }] : [], error: null };
    }
    if (name === "refund_order_atomic") {
      const order = rows.orders.find((item) => item.id === args.p_order_id);
      if (order) { order.status = "cancelled"; order.payment_status = "refunded"; }
      return { data: args.p_order_id, error: null };
    }
    return { data: "audit", error: null };
  };
  const admin = {
    from: (table) => adminClient.from(table),
    rpc: async (name, args) => { calls.push({ name, args }); return { data: [{ id: "created" }], error: null }; },
    storage: {
      from: (bucket) => ({
        createSignedUrl: async (path) => {
          signedReceiptCalls.push({ bucket, path });
          return { data: { signedUrl: `https://signed.test/${bucket}/${path}` }, error: null };
        },
      }),
    },
  };
  const shared = load("src/app/api/mobile/pos/_shared.ts", { "@supabase/supabase-js": { createClient: () => client }, "@/lib/supabase/admin": { createAdminClient: () => admin } });
  const cart = load("src/app/api/mobile/pos/_cart.ts", { "./_shared": shared });
  const auth = { client, admin, profile: rows.profiles[0], restaurants: [{ ...rows.restaurants[0], role, canManage: role !== "waiter" }] };
  const route = load("src/app/api/mobile/pos/route.ts", {
    "./_shared": { ...shared, session: async () => auth }, "./_cart": cart,
    "next/server": { after: (callback) => backgroundCalls.push(callback) }, "next/cache": { revalidatePath: () => {} },
    "@/lib/restaurant-directory-options": { businessTypeSupportsTableQr: () => true, businessTypeSupportsKitchen: () => true },
    "@/lib/supabase/storage": {
      getPrivateFileSignedUrl: async (path) => {
        signedReceiptCalls.push({ bucket: "private", path });
        return `https://signed.test/private/${path}`;
      },
      uploadPrivateFile: async () => null,
    },
    "@/lib/services/announcement.service": { announcementService: { hasActiveClosure: async () => false } },
    "@/lib/services/bank-qr.service": { bankOrderPaymentService: { availableForRestaurant: async () => true } },
    "@/lib/services/mobile-push.service": {
      registerRestaurantPosPushToken: async (input) => { notificationCalls.push({ kind: "register", input }); return { ok: true }; },
      sendOrderStatusPush: async (input) => { notificationCalls.push({ kind: "status", input }); },
      sendRestaurantNewOrderPush: async (orderId) => { notificationCalls.push({ kind: "new-order", orderId }); },
    },
    "@/lib/services/order-whatsapp-notification.service": {
      sendOrderWhatsAppNotification: async (input) => { notificationCalls.push({ kind: "whatsapp", input }); },
    },
    "@/lib/services/rider-dispatch.service": {},
    "@/lib/utils/business-hours": { getBusinessStatus: () => ({ hasSchedule: false, isOpen: true }) },
  });
  return { rows, shared, auth, route, cart, calls, rpcCalls, backgroundCalls, notificationCalls, signedReceiptCalls };
}
const post = (route, body) => route.POST(new Request("http://localhost/api/mobile/pos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const tableOrder = { action: "table-order", restaurantId, requestId, tableCode: "M4", customerName: "Cliente", paymentMethod: "cash", items: [{ productId, quantity: 2, optionIds: [] }] };

test("POS requires a bearer session before reading data", async () => {
  const { shared } = fixture();
  await assert.rejects(shared.session(new Request("http://localhost")), (e) => e.status === 401);
});
test("waiter cannot invoke cash operations or another restaurant", async () => {
  const f = fixture();
  assert.equal((await post(f.route, { action: "open-cash", restaurantId, amount: 0 })).status, 403);
  assert.equal((await post(f.route, { ...tableOrder, restaurantId: tableId })).status, 403);
  assert.equal(f.calls.length, 0);
});
test("table order uses authenticated waiter, resolved table and server prices", async () => {
  const f = fixture();
  const response = await post(f.route, { ...tableOrder, waiterName: "Forged", items: [{ ...tableOrder.items[0], price: 0.01 }] });
  assert.equal(response.status, 200);
  const { p_order: order, p_items: items } = f.calls[0].args;
  assert.equal(order.table_id, tableId);
  assert.equal(order.order_type, "table");
  assert.equal(order.total, 50);
  assert.match(order.notes, /Ana Mesera/);
  assert.match(order.notes, new RegExp(userId));
  assert.doesNotMatch(order.notes, /Forged/);
  assert.equal(items[0].unit_price, 25);
  assert.equal(f.rows.tables[0].status, "occupied");
});
test("waiter must open a shift before creating a table order", async () => {
  const f = fixture();
  f.rows.admin_audit_logs.length = 0;
  assert.equal((await post(f.route, tableOrder)).status, 409);
  assert.equal(f.calls.length, 0);
});
test("table from another restaurant or disabled table is rejected", async () => {
  const f = fixture();
  f.rows.tables[0].restaurant_id = tableId;
  assert.equal((await post(f.route, tableOrder)).status, 400);
  assert.equal(f.calls.length, 0);
});
test("retry returns the existing order without creating or uploading again", async () => {
  const f = fixture();
  f.rows.orders.push({ restaurant_id: restaurantId, table_id: tableId, public_request_id: requestId, id: "existing", order_number: "M-1", bank_checkout_hold: true });
  const response = await post(f.route, tableOrder);
  assert.equal((await response.json()).id, "existing");
  assert.equal(f.calls.length, 0);
});
test("unpaid waiter QR creates no kitchen notification and does not occupy the table", async () => {
  const f = fixture();
  const response = await post(f.route, { ...tableOrder, paymentMethod: "qr" });
  assert.equal(response.status, 200);
  assert.equal(f.calls[0].name, "create_public_order_transaction");
  assert.equal(f.calls[0].args.p_order.payment_method, "qr");
  assert.equal(f.rows.tables[0].status, "available");
  assert.equal(f.backgroundCalls.length, 0);
  assert.equal(f.notificationCalls.length, 0);
});
test("hidden QR recovery still requires the waiter's active shift and assigned table", async () => {
  const f = fixture();
  f.rows.orders.push({ restaurant_id: restaurantId, table_id: tableId, public_request_id: requestId, id: "existing", bank_checkout_hold: true });
  f.rows.admin_audit_logs.length = 0;
  assert.equal((await post(f.route, { ...tableOrder, paymentMethod: "qr" })).status, 409);
  assert.equal(f.calls.length, 0);
});
test("cashier recovers a hidden POS QR reservation without submitting a second sale", async () => {
  const f = fixture("cashier");
  f.rows.orders.push({ restaurant_id: restaurantId, order_number: `POS-${requestId}`, id: "existing", bank_checkout_hold: true });
  const response = await post(f.route, { action: "sale", restaurantId, requestId, customerName: "Cliente", paymentMethod: "qr", items: tableOrder.items });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).id, "existing");
  assert.equal(f.rpcCalls.length, 0);
});
test("a product with an optional variant keeps its base price unless selected", async () => {
  const f = fixture();
  f.rows.products[0].price = 0.5;
  f.rows.product_variants.push({ id: tableId, product_id: productId, restaurant_id: restaurantId, name: "Extra", price_delta: 0.1, is_active: true });
  const base = await f.cart.resolveCart(f.auth, restaurantId, [{ productId, quantity: 1, optionIds: [], price: 0.01 }]);
  assert.equal(base[0].unit_price, 0.5);
  assert.equal(base[0].variant_id, null);
  const extra = await f.cart.resolveCart(f.auth, restaurantId, [{ productId, variantId: tableId, quantity: 2, optionIds: [] }]);
  assert.equal(extra[0].unit_price, 0.6);
  assert.equal(extra[0].subtotal, 1.2);
  assert.equal(extra[0].variant_id, tableId);
  f.rows.products[0].price = 0.1;
  f.rows.product_variants[0].price_delta = 0.2;
  const cents = await f.cart.resolveCart(f.auth, restaurantId, [{ productId, variantId: tableId, quantity: 3, optionIds: [] }]);
  assert.equal(cents[0].unit_price, 0.3);
  assert.equal(cents[0].subtotal, 0.9);
});
test("optional variants still reject unknown, inactive and cross-product selections", async () => {
  for (const variant of [null, { is_active: false, product_id: productId }, { is_active: true, product_id: tableId }]) {
    const f = fixture();
    if (variant) f.rows.product_variants.push({ id: tableId, restaurant_id: restaurantId, price_delta: 0.1, ...variant });
    await assert.rejects(f.cart.resolveCart(f.auth, restaurantId, [{ productId, variantId: tableId, quantity: 1, optionIds: [] }]), /Variante no disponible/);
  }
});
test("required option groups remain required without a variant", async () => {
  const f = fixture();
  f.rows.product_variants.push({ id: tableId, product_id: productId, restaurant_id: restaurantId, is_active: true, price_delta: 0.1 });
  f.rows.product_option_groups.push({ id: tableId, product_id: productId, restaurant_id: restaurantId, is_active: true, name: "Guarnicion", is_required: true, min_choices: 1, max_choices: 1 });
  assert.equal((await post(f.route, tableOrder)).status, 400);
  assert.equal(f.calls.length, 0);
});

test("cashier registers the POS device for restaurant push notifications", async () => {
  const f = fixture("cashier");
  const response = await post(f.route, {
    action: "register-pos-push",
    expoPushToken: "ExpoPushToken[restaurant-device-token]",
    platform: "android",
    restaurantId,
  });
  assert.equal(response.status, 200);
  assert.equal(f.notificationCalls[0].kind, "register");
  assert.equal(f.notificationCalls[0].input.expoPushToken, "ExpoPushToken[restaurant-device-token]");
  assert.equal(f.notificationCalls[0].input.platform, "android");
  assert.equal(f.notificationCalls[0].input.restaurantId, restaurantId);
  assert.equal(f.notificationCalls[0].input.userId, userId);
});

test("cashier accepts a pending order without charging it", async () => {
  const f = fixture("cashier");
  f.rows.orders.push({
    id: requestId,
    restaurant_id: restaurantId,
    order_number: "M-9",
    order_type: "table",
    payment_status: "pending",
    status: "pending",
  });
  const response = await post(f.route, {
    action: "accept",
    orderId: requestId,
    restaurantId,
  });
  assert.equal(response.status, 200);
  assert.equal(f.rows.orders[0].status, "accepted");
  assert.equal(f.rows.orders[0].payment_status, "pending");
  assert.ok(!f.rpcCalls.some((call) => call.name === "charge_order_with_cash_movement"));
  await Promise.all(f.backgroundCalls.map((callback) => callback()));
  assert.ok(f.notificationCalls.some((call) =>
    call.kind === "status" &&
    call.input.orderId === requestId &&
    call.input.status === "accepted"
  ));
});

test("accepting skips preparation when the restaurant disabled its kitchen flow", async () => {
  const f = fixture("cashier");
  f.rows.restaurant_settings[0].kitchen_enabled = false;
  f.rows.orders.push({
    id: requestId,
    restaurant_id: restaurantId,
    order_number: "D-10",
    order_type: "pickup",
    payment_status: "pending",
    status: "pending",
  });
  const response = await post(f.route, {
    action: "accept",
    orderId: requestId,
    restaurantId,
  });
  assert.equal(response.status, 200);
  assert.equal(f.rows.orders[0].status, "ready");
  await Promise.all(f.backgroundCalls.map((callback) => callback()));
  assert.ok(f.notificationCalls.some((call) =>
    call.kind === "status" && call.input.status === "ready"
  ));
});

test("receipt viewer signs absolute private and WhatsApp storage routes for the mobile POS", async () => {
  const f = fixture("cashier");
  f.rows.orders.push({
    id: requestId,
    restaurant_id: restaurantId,
    order_type: "delivery",
    payment_receipt_url: `https://www.yopido.shop/api/storage/private/restaurants/${restaurantId}/payment-receipts/proof.jpg`,
  });
  const privateResponse = await f.route.GET(new Request(`http://localhost/api/mobile/pos?restaurantId=${restaurantId}&receiptOrderId=${requestId}`));
  assert.equal(privateResponse.status, 200);
  assert.match((await privateResponse.json()).url, /^https:\/\/signed\.test\/private\//);
  assert.deepEqual(f.signedReceiptCalls[0], {
    bucket: "private",
    path: `restaurants/${restaurantId}/payment-receipts/proof.jpg`,
  });

  f.rows.orders[0].payment_receipt_url = `https://www.yopido.shop/api/storage/whatsapp-receipts/restaurants/${restaurantId}/proof.jpg`;
  const whatsappResponse = await f.route.GET(new Request(`http://localhost/api/mobile/pos?restaurantId=${restaurantId}&receiptOrderId=${requestId}`));
  assert.equal(whatsappResponse.status, 200);
  assert.match((await whatsappResponse.json()).url, /^https:\/\/signed\.test\/whatsapp-payment-receipts\//);
  assert.deepEqual(f.signedReceiptCalls[1], {
    bucket: "whatsapp-payment-receipts",
    path: `restaurants/${restaurantId}/proof.jpg`,
  });
});

test("ETA changes are stored for live tracking without sending paid WhatsApp messages", async () => {
  const f = fixture("cashier");
  f.rows.orders.push({
    id: requestId,
    restaurant_id: restaurantId,
    order_number: "W-10",
    order_origin: "phone_whatsapp",
    order_type: "delivery",
    status: "accepted",
  });
  const response = await post(f.route, {
    action: "eta",
    adjustmentMinutes: 15,
    orderId: requestId,
    restaurantId,
  });
  assert.equal(response.status, 200);
  assert.equal(f.rows.orders[0].eta_adjustment_minutes, 15);
  assert.equal(f.rows.orders[0].eta_adjusted_by, userId);
  await Promise.all(f.backgroundCalls.map((callback) => callback()));
  assert.equal(f.notificationCalls.some((call) =>
    call.kind === "whatsapp" &&
    call.input.event === "eta_updated" &&
    call.input.orderId === requestId
  ), false);
});

test("large cash shifts are not truncated at the database page limit", async () => {
  const { shared } = fixture();
  const records = Array.from({ length: 1205 }, (_, id) => ({ id: String(id) }));
  const result = await shared.allRows(async (from, to) => ({ data: records.slice(from, to + 1), error: null }));
  assert.equal(result.length, 1205);
  assert.equal(result.at(-1).id, "1204");
});

test("cashier settles every active order before releasing the table", async () => {
  const f = fixture("cashier");
  f.rows.orders.push({
    id: requestId, restaurant_id: restaurantId, table_id: tableId, order_number: "M-10", order_type: "table",
    status: "pending", payment_status: "pending", payment_method: "cash", total: 50,
  });
  const response = await post(f.route, { action: "settle-table", restaurantId, tableId, paymentMethod: "cash", cashReceived: 50 });
  assert.equal(response.status, 200);
  assert.equal(f.rows.orders[0].payment_status, "paid");
  assert.equal(f.rows.orders[0].status, "delivered");
  assert.equal(f.rows.tables[0].status, "available");
  assert.ok(f.rpcCalls.some((call) => call.name === "charge_order_with_cash_movement"));
});

test("cashier cancellation keeps an owner review with actor and reason", async () => {
  const f = fixture("cashier");
  f.rows.order_items = [{ id: "line", order_id: requestId, product_name: "Almuerzo", quantity: 1, subtotal: 25 }];
  f.rows.cash_movements = [];
  f.rows.order_cancellation_reviews = [];
  f.rows.orders.push({
    id: requestId, restaurant_id: restaurantId, table_id: tableId, order_number: "M-11", order_type: "table",
    status: "accepted", payment_status: "pending", payment_method: "cash", total: 25,
    payment_receipt_url: null, payment_receipt_reference: null, payment_receipt_uploaded_at: null,
    requested_fulfillment_at: null, accepted_at: new Date().toISOString(), ready_at: null, delivered_at: null,
  });
  const response = await post(f.route, { action: "cancel-order", restaurantId, orderId: requestId, reason: "Producto comandado por error" });
  assert.equal(response.status, 200);
  assert.equal(f.rows.orders[0].status, "cancelled");
  assert.equal(f.rows.tables[0].status, "available");
  assert.equal(f.rows.order_cancellation_reviews[0].cancelled_by, userId);
  assert.equal(f.rows.order_cancellation_reviews[0].reason, "Producto comandado por error");
  assert.equal(f.rows.order_cancellation_reviews[0].owner_review_status, "pending");
});
