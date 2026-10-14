// QA acceptance probes: real SQL RPCs in isolated PostgreSQL, no remote writes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const restaurant = '11111111-1111-4111-8111-111111111111';
const actor = '22222222-2222-4222-8222-222222222222';
const table = '33333333-3333-4333-8333-333333333333';
const order = '44444444-4444-4444-8444-444444444444';
async function fixture(type = 'delivery') {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('qa.user',true),'')::uuid$$;
    create type app_role as enum ('restaurant_admin','cashier','kitchen','waiter');
    create type order_status as enum ('pending','accepted','preparing','ready','delivered','cancelled');
    create type order_type as enum ('table','delivery','pickup');
    create type payment_method_type as enum ('cash','qr');
    create function is_superadmin() returns boolean language sql as $$select false$$;
    create function has_restaurant_role(r uuid, roles app_role[]) returns boolean language sql as $$
      select r='${restaurant}'::uuid and current_setting('qa.role',true)=any(roles::text[])$$;
    create table restaurants(id uuid primary key,status text);
    create table tables(id uuid primary key,restaurant_id uuid,is_active boolean,status text);
    create table cash_sessions(id uuid primary key default gen_random_uuid(),restaurant_id uuid,status text,opened_at timestamptz default now());
    create table orders(id uuid primary key,restaurant_id uuid,table_id uuid,order_type order_type,
      order_number text,status order_status,payment_status text,payment_method payment_method_type,
      total numeric,payment_receipt_url text,payment_receipt_uploaded_at timestamptz,payment_receipt_reference text,
      payment_verified_at timestamptz,accepted_at timestamptz,preparing_at timestamptz,ready_at timestamptz,
      delivered_at timestamptz,cancellation_reason text,created_at timestamptz default now(),updated_at timestamptz default now(),
      requested_fulfillment_at timestamptz);
    create table cash_movements(id uuid default gen_random_uuid(),restaurant_id uuid,cash_session_id uuid,
      order_id uuid,type text,payment_method payment_method_type,amount numeric,description text,created_by uuid);
    -- Inventory/RLS dependency fixtures: not an inventory or production-RLS certification.
    create table inventory_calls(order_id uuid primary key);
    create function apply_order_inventory_usage(o uuid) returns void language sql as $$
      insert into inventory_calls values(o) on conflict do nothing$$;
    insert into restaurants values('${restaurant}','active');
    insert into tables values('${table}','${restaurant}',true,'occupied');
    insert into cash_sessions(restaurant_id,status)values('${restaurant}','open');
    insert into orders(id,restaurant_id,table_id,order_type,order_number,status,payment_status,total)
      values('${order}','${restaurant}','${table}','${type}','QA-1','pending','pending',60);
    select set_config('qa.user','${actor}',false),set_config('qa.role','cashier',false);
  `);
  await db.exec(read('supabase/migrations/0092_fast_operational_order_status.sql'));
  await db.exec(read('supabase/migrations/0103_fix_table_settlement_and_payment_flow.sql'));
  const charge = (method = 'cash', proof = null) => db.query('select charge_order_with_cash_movement($1,$2,$3,$4,null)', [restaurant, order, method, proof]);
  const advance = async (from, to) => (await db.query('select * from update_operational_order_status($1,$2,$3,$4)', [restaurant, order, from, to])).rows;
  return { db, charge, advance };
}

test('QA cash -> kitchen -> delivery: duplicate charges and transitions are idempotent', async () => {
  const { db, charge, advance } = await fixture();
  try {
    await Promise.all(Array.from({ length: 10 }, () => charge()));
    const movements = (await db.query('select amount,payment_method from cash_movements')).rows;
    assert.equal(movements.length, 1);
    assert.equal(Number(movements[0].amount), 60);
    assert.equal((await db.query('select status,payment_status from orders')).rows[0].status, 'accepted');
    assert.equal((await advance('accepted', 'preparing'))[0].status_changed, true);
    assert.equal((await advance('accepted', 'preparing'))[0].status_changed, false);
    assert.equal((await advance('preparing', 'ready'))[0].status_changed, true);
    assert.equal((await advance('ready', 'delivered'))[0].status_changed, true);
    assert.equal((await advance('ready', 'delivered'))[0].status_changed, false);
    assert.equal((await db.query('select status,payment_status from orders')).rows[0].payment_status, 'paid');
  } finally { await db.close(); }
});

test('QA payment rejects unauthorized actors, cancelled orders, missing QR proof and closed cash', async () => {
  const { db, charge } = await fixture();
  try {
    await db.exec("select set_config('qa.role','waiter',false)");
    await assert.rejects(charge(), /cash access denied/);
    await db.exec("select set_config('qa.role','cashier',false),set_config('qa.user','',false)");
    await assert.rejects(charge(), /cash access denied/);
    await db.exec(`select set_config('qa.user','${actor}',false)`);
    await assert.rejects(charge('qr'), /receipt-required/);
    await db.exec("update cash_sessions set status='closed'");
    await assert.rejects(charge(), /no-open-session/);
    await db.exec("update cash_sessions set status='open'; update orders set status='cancelled'");
    await assert.rejects(charge(), /order-cancelled/);
    assert.equal((await db.query('select count(*)::int n from cash_movements')).rows[0].n, 0);
  } finally { await db.close(); }
});

test('QA QR proof is preserved when the cashier explicitly charges the order', async () => {
  const { db, charge } = await fixture();
  try {
    await charge('qr', 'qa-private-proof');
    await charge('qr', 'different-proof');
    const row = (await db.query('select * from orders')).rows[0];
    assert.equal(row.payment_receipt_url, 'qa-private-proof');
    assert.equal(row.payment_method, 'qr');
    assert.equal(row.payment_status, 'paid');
    assert.ok(row.payment_verified_at);
    assert.equal((await db.query('select count(*)::int n from cash_movements')).rows[0].n, 1);
  } finally { await db.close(); }
});

test('QA table approval cooks without charging, settlement charges once and frees table', async () => {
  const { db, advance } = await fixture('table');
  try {
    await db.exec("select set_config('qa.role','waiter',false)");
    const approve = () => db.query('select * from approve_table_order_for_preparation($1,$2)', [restaurant, order]);
    assert.equal((await approve()).rows[0].status_changed, true);
    assert.equal((await approve()).rows[0].status_changed, false);
    assert.equal((await db.query('select payment_status from orders')).rows[0].payment_status, 'pending');
    assert.equal((await db.query('select count(*)::int n from cash_movements')).rows[0].n, 0);
    await advance('accepted', 'preparing');
    await advance('preparing', 'ready');
    await db.exec("select set_config('qa.role','cashier',false)");
    const settle = () => db.query("select * from settle_table_with_cash_movements($1,$2,'cash')", [restaurant, table]);
    assert.equal((await settle()).rows[0].charged_order_count, 1);
    assert.equal((await settle()).rows[0].charged_order_count, 0);
    assert.equal((await db.query('select status from tables')).rows[0].status, 'available');
    assert.equal((await db.query('select status,payment_status from orders')).rows[0].status, 'delivered');
    assert.equal((await db.query('select count(*)::int n from cash_movements')).rows[0].n, 1);
  } finally { await db.close(); }
});

test('QA diagnostic: a future multisite release does not prevent starting preparation', async () => {
  const { db, advance } = await fixture();
  try {
    await db.exec("update orders set status='accepted',requested_fulfillment_at=now()+interval '30 minutes'");
    const result = await advance('accepted', 'preparing');
    assert.equal(result[0].status_changed, true);
    // Reproduces QA-02; passing this diagnostic does NOT approve release coordination.
  } finally { await db.close(); }
});

function load(path, deps = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(read(path), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports, require: name => deps[name] });
  return exports;
}
test('QA diagnostic: queue forecast and route disagree under kitchen demand', () => {
  const { forecastMultisiteKitchenReadyIn } = load('src/lib/group-orders/kitchen-forecast.ts');
  const { planMultisiteGroupOrder } = load('src/lib/group-orders/multisite-planner.ts', {
    '@/lib/utils/geo-distance': load('src/lib/utils/geo-distance.ts'),
  });
  const snapshot = { queueEnabled: true, basePrepMinutes: 12, kitchenCapacity: 3, activeOrders: 12, preparingOrders: 3, recentOrders: 12 };
  const forecast = forecastMultisiteKitchenReadyIn(snapshot, 12);
  const plan = planMultisiteGroupOrder({ destination: { latitude: -17.39, longitude: -66.16 },
    candidates: [{ id: 'burger', name: 'Burger', location: { latitude: -17.38, longitude: -66.16 },
      prepTimeMinutes: 12, queueDelayMinutes: forecast.queueDelayMinutes, kitchenSnapshot: snapshot }] });
  assert.equal(forecast.estimatedReadyInMinutes, 60);
  assert.equal(plan.stops[0].estimatedReadyInMinutes, 57);
  // Reproduces QA-01. Do not count this passing diagnostic as a correctness approval.
});

test('QA revised access: denied membership redirects even when monitoring fails', async () => {
  const exports = load('src/lib/services/restaurant-access.service.ts', {
    'next/headers': { headers: async () => new Headers() },
    'next/navigation': { redirect: url => { throw new Error(`REDIRECT:${url}`); } },
    '@/lib/supabase/env': { hasSupabaseEnv: () => true },
    '@/lib/utils/perf': { perfNow: () => 0, perfLog: () => {} },
    '@/lib/supabase/server': { createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: { id: actor } }, error: null }) },
      from: name => { const q = { select: () => q, eq: () => q, limit: () => q,
        maybeSingle: async () => ({ data: name === 'profiles' ? { global_role: null } : null, error: null }) }; return q; },
    }) },
  });
  await assert.rejects(exports.restaurantAccessService.claimOrRedirect(restaurant, undefined,
    { name: 'QA', status: 'active' }), /REDIRECT:\/admin\/login\?error=no-access/);
});

function loadFunctions(path, names) {
  const source = read(path);
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text));
  assert.equal(functions.length, names.length);
  const exports = {};
  vm.runInNewContext(ts.transpileModule(functions.map(node => node.getText(ast)).join('\n') +
    names.map(name => `\nexports.${name}=${name};`).join(''), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    } }).outputText, { exports, Date, Intl });
  return exports;
}

test('QA catalog: empty days are not Sunday-only and overnight availability crosses the correct day', () => {
  const { parseProductDays, validateProductScheduleInput } = loadFunctions('src/app/admin/actions.ts',
    ['parseProductDays', 'optionalDateTimeInputToDate', 'optionalTimeInput', 'validateProductScheduleInput']);
  assert.equal(parseProductDays('').length, 0);
  assert.equal(parseProductDays(null).length, 0);
  assert.equal(parseProductDays('0')[0], 0);
  assert.equal(validateProductScheduleInput({ availableStartTime: '22:00', availableEndTime: '02:00' }), null);
  assert.equal(validateProductScheduleInput({ availableStartTime: '25:00' }), 'invalid');
  const { isWithinProductSchedule } = loadFunctions('src/lib/services/product.service.ts', ['isWithinProductSchedule']);
  const schedule = { availableDays: [5], start: 22 * 60, end: 2 * 60 };
  assert.equal(isWithinProductSchedule({ ...schedule, dayOfWeek: 5, minutes: 23 * 60 }), true);
  assert.equal(isWithinProductSchedule({ ...schedule, dayOfWeek: 6, minutes: 60 }), true);
  assert.equal(isWithinProductSchedule({ ...schedule, dayOfWeek: 6, minutes: 3 * 60 }), false);
  assert.equal(isWithinProductSchedule({ ...schedule, dayOfWeek: 0, minutes: 60 }), false);
});

test('QA WhatsApp policy intentionally skips preparing/ETA/delivered without contacting Meta', async () => {
  const notifications = load('src/lib/services/order-whatsapp-notification.service.ts', {
    '@/lib/supabase/admin': { createAdminClient: () => ({ from: name => {
      assert.equal(name, 'orders');
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: {
        id: order, restaurant_id: restaurant, order_origin: 'phone_whatsapp', order_type: 'delivery',
      }, error: null }) }; return q;
    } }) },
    '@/lib/seo/site-url': { getSiteUrl: () => 'https://qa.invalid' },
    '@/lib/services/whatsapp-connection.service': {},
  });
  for (const event of ['preparing', 'eta_updated', 'delivered', 'ready', 'arrived']) {
    const result = await notifications.sendOrderWhatsAppNotification({ event, orderId: order });
    assert.equal(result.ok, true);
    assert.equal(result.skipped, 'notification-policy');
  }
});
