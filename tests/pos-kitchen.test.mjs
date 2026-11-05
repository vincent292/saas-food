import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { z } from 'zod';

const require = createRequire(import.meta.url);
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const restaurantId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const orderId = '33333333-3333-4333-8333-333333333333';
const productId = '44444444-4444-4444-8444-444444444444';
const requestId = '55555555-5555-4555-8555-555555555555';
function load(source, context = {}, mocks = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: name => name in mocks ? mocks[name] : require(name), z, FormData, crypto, Date, console, ...context });
  return exports;
}
// Run the real action bodies and input schemas, replacing only infrastructure.
const ast = ts.createSourceFile('actions.ts', read('src/app/admin/actions.ts'), ts.ScriptTarget.Latest, true);
const names = new Set(['paymentMethodSchema', 'orderOriginSchema', 'cashReceivedSchema', 'posCartItemSchema', 'createPosSaleSchema', 'createPosSaleInPlaceAction', 'extendKitchenOrderTimeAction', 'cancelPosQrSaleAction']);
const source = ast.statements.filter(node => ts.isFunctionDeclaration(node) ? names.has(node.name?.text) : ts.isVariableStatement(node) && node.declarationList.declarations.some(item => names.has(item.name.getText(ast)))).map(node => node.getText(ast)).join('\n');
function fixture(role = 'cashier') {
  const rows = {
    profiles: [{ id: userId, global_role: null }],
    restaurant_memberships: [{ restaurant_id: restaurantId, user_id: userId, role, is_active: true }],
    orders: [],
  };
  const calls = [];
  let rpcError = null;
  const client = {
    from(table) {
      const filters = []; let values = null, single = false;
      const query = {
        select() { return query; }, update(payload) { values = payload; return query; },
        eq(key, value) { filters.push(row => row[key] === value); return query; },
        in(key, values) { filters.push(row => values.includes(row[key])); return query; },
        maybeSingle() { single = true; return query; },
        then(resolve) { const selected = (rows[table] ?? []).filter(row => filters.every(filter => filter(row)));
          if (values) { calls.push(['update', table, values]); selected.forEach(row => Object.assign(row, values)); }
          return Promise.resolve({ data: single ? selected[0] ?? null : selected, error: null }).then(resolve); },
      }; return query;
    },
    async rpc(name, args) {
      calls.push([name, args]);
      if (name === 'create_pos_sale_with_tender') {
        if (rpcError) return { data: null, error: rpcError };
        rows.orders.push({ id: orderId, restaurant_id: restaurantId, order_number: args.p_order_number, tracking_token: 'private-receipt', payment_method: args.p_payment_method,
          status: args.p_payment_method === 'qr' ? 'pending' : 'accepted', payment_status: args.p_payment_method === 'qr' ? 'pending' : 'paid' });
        return { data: orderId, error: null };
      }
      return { data: null, error: null };
    },
  };
  let bankStatus = 'not_created';
  const bank = { bankOrderPaymentService: { availableForRestaurant: async () => true, cancel: async () => ({ status: bankStatus }) } };
  const actions = load(source, {
    requireUser: async () => ({ supabase: client, user: { id: userId } }),
    requireRestaurantAccess: async () => {}, createAdminClient: () => client,
    restaurantUsesKitchenFlow: async () => true, revalidatePath: () => {}, after: () => {},
    posSaleRedirectPath: () => '/cash', cashErrorKey: error => error.code,
  }, { '@/lib/services/bank-qr.service': bank });
  const saleForm = method => {
    const form = new FormData();
    Object.entries({ restaurantId, posRequestId: requestId, paymentMethod: method, cashReceived: '60', cartJson: JSON.stringify([{ productId, name: 'Pizza', price: 60, quantity: 1 }]) }).forEach(([key, value]) => form.set(key, value));
    return form;
  };
  return { actions, rows, calls, saleForm, rpcError: error => { rpcError = error; }, bankStatus: status => { bankStatus = status; } };
}

test('POS QR reserves an unpaid order, recovers the same receipt, and never manually accepts it', async () => {
  const f = fixture();
  const first = await f.actions.createPosSaleInPlaceAction(f.saleForm('qr'));
  const second = await f.actions.createPosSaleInPlaceAction(f.saleForm('qr'));
  assert.equal(first.ok, true); assert.equal(second.order.id, first.order.id);
  assert.equal(f.calls.filter(call => call[0] === 'create_pos_sale_with_tender').length, 1);
  assert.equal(f.rows.orders[0].status, 'pending'); assert.equal(f.rows.orders[0].payment_status, 'pending');
  assert.equal(f.calls.filter(call => call[0] === 'update').length, 0);
});

test('cashiers can extend active preparation; stale updates, completed orders, limits and other branches are rejected', async () => {
  const f = fixture('kitchen');
  f.rows.orders.push({ id: orderId, restaurant_id: restaurantId, status: 'accepted', eta_adjustment_minutes: 0 });
  const input = { restaurantId, orderId, expectedMinutes: 0, extraMinutes: 5 };
  assert.equal((await f.actions.extendKitchenOrderTimeAction(input)).minutes, 5);
  assert.equal((await f.actions.extendKitchenOrderTimeAction(input)).ok, false);
  assert.equal((await f.actions.extendKitchenOrderTimeAction({ ...input, expectedMinutes: 5, extraMinutes: 10 })).minutes, 15);
  assert.equal((await f.actions.extendKitchenOrderTimeAction({ ...input, expectedMinutes: 180 })).ok, false);
  assert.equal((await f.actions.extendKitchenOrderTimeAction({ ...input, restaurantId: productId })).ok, false);
  f.rows.orders[0].status = 'ready';
  assert.equal((await f.actions.extendKitchenOrderTimeAction({ ...input, expectedMinutes: 15 })).ok, false);
  assert.equal(f.rows.orders[0].eta_adjustment_minutes, 15);
});

test('waiters cannot charge POS sales, cancel bank QR sales or extend kitchen times', async () => {
  const f = fixture('waiter');
  assert.equal((await f.actions.createPosSaleInPlaceAction(f.saleForm('cash'))).ok, false);
  assert.equal((await f.actions.extendKitchenOrderTimeAction({ restaurantId, orderId, expectedMinutes: 0, extraMinutes: 5 })).ok, false);
  assert.equal((await f.actions.cancelPosQrSaleAction({ restaurantId, orderId })).ok, false);
  assert.equal(f.calls.length, 0);
});

test('POS cancellation waits for authoritative bank cancellation and cannot discard a paid sale', async () => {
  const f = fixture(); await f.actions.createPosSaleInPlaceAction(f.saleForm('qr'));
  f.bankStatus('paid'); assert.equal((await f.actions.cancelPosQrSaleAction({ restaurantId, orderId })).ok, false);
  f.bankStatus('pending'); assert.equal((await f.actions.cancelPosQrSaleAction({ restaurantId, orderId })).ok, false);
  assert.equal(f.rows.orders[0].status, 'pending');
  f.bankStatus('not_created'); assert.equal((await f.actions.cancelPosQrSaleAction({ restaurantId, orderId })).ok, true);
  assert.equal(f.rows.orders[0].status, 'cancelled');
  assert.equal((await f.actions.cancelPosQrSaleAction({ restaurantId, orderId })).ok, false);
});

test('paid QR is complete only after the restaurant order is operational, without held or review states', () => {
  const { bankOrderIsSettled } = load(read('src/lib/payments/bank-order-state.ts'));
  for (const orderStatus of ['pending', 'cancelled', undefined]) assert.equal(bankOrderIsSettled({ status: 'paid', orderStatus }), false);
  assert.equal(bankOrderIsSettled({ status: 'paid', orderStatus: 'accepted', checkoutHeld: true }), false);
  assert.equal(bankOrderIsSettled({ status: 'paid', orderStatus: 'accepted', applicationState: 'review' }), false);
  assert.equal(bankOrderIsSettled({ status: 'pending', orderStatus: 'accepted' }), false);
  for (const orderStatus of ['accepted', 'preparing', 'ready', 'delivered']) assert.equal(bankOrderIsSettled({ status: 'paid', orderStatus }), true);
});

test('preparation extensions shift the kitchen countdown from acceptance, without resetting its start', () => {
  const presentation = load(read('src/components/orders/orderPresentation.ts'), {}, {
    '@/lib/restaurant-directory-options': {},
  });
  const order = { acceptedAt: '2026-11-05T12:00:00Z', createdAt: '2026-11-05T11:50:00Z', items: [{ quantity: 1, prepMinutes: 15 }], etaAdjustmentMinutes: 10 };
  assert.equal(presentation.kitchenDueDate(order).toISOString(), '2026-11-05T12:25:00.000Z');
  assert.equal(presentation.kitchenDueDate({ ...order, etaAdjustmentMinutes: 0 }).toISOString(), '2026-11-05T12:15:00.000Z');
});

test('the customer queue includes the same added preparation minutes and shifted ready time', async () => {
  const client = { rpc: async () => ({ data: { restaurant_id: restaurantId, status: 'accepted', estimated_min_minutes: 12, estimated_max_minutes: 18, estimated_ready_at_min: '2026-11-05T12:12:00Z', estimated_ready_at_max: '2026-11-05T12:18:00Z' }, error: null }) };
  const query = { select() { return query; }, eq() { return query; }, maybeSingle: async () => ({ data: { eta_adjustment_minutes: 10 }, error: null }) };
  const { orderService } = load(read('src/lib/services/order.service.ts'), {}, {
    '@/lib/supabase/server': { createClient: async () => client },
    '@/lib/supabase/admin': { createAdminClient: () => ({ from: () => query }) },
    '@/lib/supabase/env': { hasSupabaseEnv: () => true }, '@/lib/utils/perf': {},
  });
  const queue = await orderService.getPublicQueueState(restaurantId, orderId, 'private-token');
  assert.equal(queue.estimatedMinMinutes, 22); assert.equal(queue.estimatedMaxMinutes, 28);
  assert.equal(queue.estimatedReadyAtMax, '2026-11-05T12:28:00.000Z');
});


test('an indeterminate RPC result requires recovering the same sale rather than reporting a rejected payment', async () => {
  const f = fixture(); f.rpcError({ code: '', message: 'Failed to fetch' });
  await assert.rejects(f.actions.createPosSaleInPlaceAction(f.saleForm('cash')), /pos-sale-outcome-unknown/);
  f.rpcError(null);
  const recovered = await f.actions.createPosSaleInPlaceAction(f.saleForm('cash'));
  assert.equal(recovered.ok, true); assert.equal(f.rows.orders.length, 1);
  assert.equal(f.calls.filter(call => call[0] === 'create_pos_sale_with_tender')[0][1].p_order_number, f.calls.filter(call => call[0] === 'create_pos_sale_with_tender')[1][1].p_order_number);
});
