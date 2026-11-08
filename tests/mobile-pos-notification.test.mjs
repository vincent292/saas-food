import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
function load(path, mocks = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: name => name in mocks ? mocks[name] : require(name), Date, console, ...globals });
  return exports;
}
const sounds = load('src/lib/mobile-pos-notification.ts');
test('iOS receives its bundled WAV while existing Android channels retain the original sound', () => {
  assert.equal(sounds.posNotificationSound('ios'), 'pos_order.wav');
  for (const platform of ['android', null, undefined]) assert.equal(sounds.posNotificationSound(platform), 'notificaiones.mp3');
});
test('table service pushes choose sound per device and never notify another restaurant member', async () => {
  const now = new Date().toISOString();
  const rows = {
    table_service_calls: [{ id: 'call', restaurant_id: 'local', table_id: 'table', assigned_waiter_id: 'first', status: 'pending', notification_claimed_at: null, created_at: now }],
    tables: [{ id: 'table', restaurant_id: 'local', name: 'Mesa 4' }],
    restaurant_memberships: [{ restaurant_id: 'local', user_id: 'cashier', role: 'cashier', is_active: true }, { restaurant_id: 'local', user_id: 'first', role: 'waiter', is_active: true }, { restaurant_id: 'local', user_id: 'helper', role: 'waiter', is_active: true }],
    admin_audit_logs: [{restaurant_id:'local',actor_user_id:'first',action:'waiter_shift_opened'}],
    restaurant_pos_push_tokens: [
      { restaurant_id: 'local', user_id: 'first', expo_push_token: 'ExponentPushToken[first-device]', platform: 'android', is_enabled: true, last_seen_at: now },
      { restaurant_id: 'local', user_id: 'helper', expo_push_token: 'ExponentPushToken[helper-device]', platform: 'android', is_enabled: true, last_seen_at: now },
      { restaurant_id: 'local', user_id: 'cashier', expo_push_token: 'ExponentPushToken[ios-device]', platform: 'ios', is_enabled: true, last_seen_at: now },
      { restaurant_id: 'local', user_id: 'cashier', expo_push_token: 'ExponentPushToken[android-device]', platform: 'android', is_enabled: true, last_seen_at: now },
      { restaurant_id: 'other', user_id: 'cashier', expo_push_token: 'ExponentPushToken[other-device]', platform: 'ios', is_enabled: true, last_seen_at: now },
    ],
  };
  const db = { from(table) {
    let filters = [], values = null, single = false;
    const query = { select() { return query; }, order() { return query; }, limit() { return query; }, in(k,values) { filters.push(row => values.includes(row[k]));return query; }, update(v) { values = v; return query; }, insert() { return query; },
      eq(k,v) { filters.push(row => row[k] === v); return query; }, is(k,v) { filters.push(row => row[k] === v); return query; }, gte(k,v) { filters.push(row => row[k] >= v); return query; },
      maybeSingle() { single = true; return query; }, then(resolve) { const result = (rows[table] ?? []).filter(row => filters.every(f => f(row))); if (values) result.forEach(row => Object.assign(row, values)); return Promise.resolve({ data: single ? result[0] ?? null : result, error: null }).then(resolve); } };
    return query;
  } };
  const messages = [];
  const service = load('src/lib/services/mobile-push.service.ts', { '@/lib/mobile-pos-notification': sounds, '@/lib/supabase/admin': { createAdminClient: () => db } }, { fetch: async (_url, options) => { messages.push(...JSON.parse(options.body)); return { ok: true, json: async () => ({ data: [{ status: 'ok' }, { status: 'ok' }] }) }; }, AbortSignal });
  await service.sendTableServicePush('call');
  assert.equal(messages.length, 3);
  assert(messages.some(m => m.to.includes("first-device")));
  assert(!messages.some(m => m.to.includes("helper-device")));
  await service.sendTableServicePush("call");
  assert.equal(messages.length, 3);
  assert.equal(messages.find(m => m.to.includes('ios-device')).sound, 'pos_order.wav');
  assert.equal(messages.find(m => m.to.includes('android-device')).sound, 'notificaiones.mp3');
});
