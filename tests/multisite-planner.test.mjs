import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = new URL("../", import.meta.url);

function loadPlanner() {
  const input = readFileSync(new URL("src/lib/group-orders/multisite-planner.ts", root), "utf8");
  const output = ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(output, {
    exports,
    require: (name) => name === "@/lib/utils/geo-distance" ? {
      calculateDistanceKm: (from, to) => Math.hypot(to.latitude - from.latitude, to.longitude - from.longitude) * 111,
    } : require(name),
  });
  return exports;
}

function loadModule(path) {
  const input = readFileSync(new URL(path, root), "utf8");
  const output = ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(output, { exports, require });
  return exports;
}

const { planMultisiteGroupOrder } = loadPlanner();
const { forecastMultisiteKitchenReadyIn } = loadModule("src/lib/group-orders/kitchen-forecast.ts");
const destination = { latitude: 0, longitude: 0 };
const candidates = [
  { id: "slow", name: "Carnes", location: { latitude: 0.01, longitude: 0 }, prepTimeMinutes: 35, coldRisk: "medium" },
  { id: "fast", name: "Burger", location: { latitude: 0.02, longitude: 0 }, prepTimeMinutes: 12, coldRisk: "high" },
];

test("multisite planner includes the rider approach in time and route but not in the customer fare", () => {
  const withoutRider = planMultisiteGroupOrder({ destination, candidates, baseFee: 6, feePerKm: 2, extraPickupFee: 3, maxRouteKm: 20 });
  const plan = planMultisiteGroupOrder({
    destination,
    candidates,
    riderStart: { latitude: 0.005, longitude: 0 },
    baseFee: 6,
    feePerKm: 2,
    extraPickupFee: 3,
    maxRouteKm: 20,
  });

  assert.equal(plan.segments[0].fromId, "rider");
  assert.ok(plan.totalRouteKm > plan.pickupToDestinationRouteKm);
  assert.deepEqual(plan.riderPricing, withoutRider.riderPricing);
  assert.equal(plan.riderPricing.suggestedRiderFee, Number((plan.riderPricing.baseDeliveryFee + 3).toFixed(2)));
  assert.equal(plan.riderPricing.customerMinimumFee, plan.riderPricing.baseDeliveryFee);
  assert.equal(plan.riderPricing.customerMaximumFee, Number((plan.riderPricing.suggestedRiderFee + 5).toFixed(2)));
});

test("multisite planner staggers kitchen release so food is ready near its pickup", () => {
  const plan = planMultisiteGroupOrder({
    destination,
    candidates,
    riderStart: { latitude: 0.004, longitude: 0 },
    averageSpeedKmh: 30,
    maxRouteKm: 20,
  });

  assert.ok(plan.routeStartDelayMinutes > 0);
  assert.ok(plan.stops.some((stop) => stop.orderReleaseDelayMinutes > 0));
  assert.ok(plan.stops.every((stop) => stop.foodWaitMinutes <= 1));
  assert.ok(plan.firstPickupToDeliveryMinutes < plan.estimatedPickupWindowMinutes);
});

test("multisite planner refuses routes that exceed the first-pickup food quality limit", () => {
  const plan = planMultisiteGroupOrder({
    destination,
    candidates,
    maxRouteKm: 20,
    maxFirstPickupToDeliveryMinutes: 1,
  });

  assert.equal(plan.feasible, false);
  assert.ok(plan.warnings.some((warning) => warning.includes("primera comida")));
});

test("live kitchen queue forecast adds waiting time and the planner respects it", () => {
  const calm = forecastMultisiteKitchenReadyIn({ queueEnabled: true, basePrepMinutes: 15, kitchenCapacity: 3, activeOrders: 0, preparingOrders: 0, recentOrders: 0 }, 20);
  const busy = forecastMultisiteKitchenReadyIn({ queueEnabled: true, basePrepMinutes: 15, kitchenCapacity: 3, activeOrders: 6, preparingOrders: 1, recentOrders: 9, rushMultiplier: 1.25 }, 20);
  assert.equal(calm.queueDelayMinutes, 0);
  assert.ok(busy.queueDelayMinutes > 0);
  assert.ok(busy.estimatedReadyInMinutes > calm.estimatedReadyInMinutes);

  const plan = planMultisiteGroupOrder({
    destination,
    candidates: [{ id: "busy", name: "Cocina ocupada", location: { latitude: 0.01, longitude: 0 }, prepTimeMinutes: 20, queueDelayMinutes: busy.queueDelayMinutes }],
    maxRouteKm: 20,
  });
  assert.equal(plan.stops[0].estimatedReadyInMinutes, 20 + busy.queueDelayMinutes);
  assert.equal(plan.routeStartDelayMinutes, 20 + busy.queueDelayMinutes);
});

test("multisite simulator is restricted to superadmins and appears in their navigation", () => {
  const page = readFileSync(new URL("src/app/admin/multi-pedidos/simulador/page.tsx", root), "utf8");
  const navigation = readFileSync(new URL("src/components/layout/AdminShellClient.tsx", root), "utf8");
  const client = readFileSync(new URL("src/components/admin/MultisiteSimulatorClient.tsx", root), "utf8");

  assert.match(page, /profile\.globalRole !== "superadmin"/);
  assert.match(page, /<MultisiteSimulatorClient operationalRestaurants=\{operationalRestaurants\} \/>/);
  assert.match(page, /multisiteSimulatorService\.listOperationalRestaurants/);
  assert.match(navigation, /href: "\/admin\/multi-pedidos\/simulador"/);
  assert.match(client, /GoogleLocationFields/);
  assert.match(client, /Actualizar colas/);
  assert.match(client, /google\.com\/maps\/dir/);
});

test("public multisite checkout keeps one master order and normal child orders", () => {
  const checkout = readFileSync(new URL("src/components/public-menu/MultisiteCheckoutClient.tsx", root), "utf8");
  const action = readFileSync(new URL("src/app/pedido/multi/actions.ts", root), "utf8");
  const migration = readFileSync(new URL("supabase/migrations/0112_public_multisite_orders.sql", root), "utf8");
  const tracking = readFileSync(new URL("src/components/public-menu/MultisiteOrderSuccessClient.tsx", root), "utf8");

  assert.match(checkout, /Máximo 3 locales/);
  assert.match(checkout, /GoogleLocationFields/);
  assert.match(checkout, /Pago habilitado: efectivo/);
  assert.match(action, /resolveCart\(admin/);
  assert.match(action, /planMultisiteGroupOrder/);
  assert.match(action, /create_public_multisite_order_transaction/);
  assert.match(action, /payment_method: "cash"/);
  assert.match(migration, /create table if not exists multisite_orders/);
  assert.match(migration, /create table if not exists multisite_order_children/);
  assert.match(migration, /insert into orders/);
  assert.match(migration, /sync_multisite_order_child_status/);
  assert.match(tracking, /clearCart/);
});

test("group orders can consolidate multiple stores and dispatch negotiates privately", () => {
  const groupAction = readFileSync(new URL("src/app/r/actions.ts", root), "utf8");
  const groupClient = readFileSync(new URL("src/components/group-orders/GroupOrderSessionClient.tsx", root), "utf8");
  const groupMigration = readFileSync(new URL("supabase/migrations/0113_group_multisite_checkout_link.sql", root), "utf8");
  const dispatchMigration = readFileSync(new URL("supabase/migrations/0114_multisite_rider_negotiation.sql", root), "utf8");
  const dispatchService = readFileSync(new URL("src/lib/services/multisite-rider-negotiation.service.ts", root), "utf8");
  const radar = readFileSync(new URL("src/components/public-menu/MultisiteDeliverySearchRadar.tsx", root), "utf8");

  assert.match(groupAction, /submitted_multisite_order_id/);
  assert.match(groupAction, /create_public_multisite_order_transaction/);
  assert.match(groupAction, /multisite-cash-only/);
  assert.match(groupClient, /Pedido desde varios locales/);
  assert.match(groupClient, /¿De qué local agregamos ahora\?/);
  assert.match(groupClient, /Oferta para la moto/);
  assert.match(groupMigration, /submitted_multisite_order_id/);
  assert.match(groupMigration, /restaurant_id uuid references restaurants/);
  assert.match(dispatchMigration, /create table if not exists multisite_rider_offers/);
  assert.match(dispatchMigration, /create table if not exists multisite_delivery_dispatches/);
  assert.match(dispatchMigration, /interval '15 seconds'/);
  assert.match(dispatchService, /roundRadarPosition/);
  assert.match(dispatchService, /Never return a rider GPS position/);
  assert.match(dispatchService, /counter_fee/);
  assert.match(radar, /Buscando delivery cercano/);
  assert.match(radar, /Buscar otra/);
});
