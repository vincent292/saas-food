import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);
const source = (path) => readFileSync(new URL(path, root), 'utf8');
function load(path, mocks = {}, globals = {}, extra = '') {
  const output = ts.transpileModule(source(path) + extra, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(output, {
    exports, require: (name) => name in mocks ? mocks[name] : require(name), console,
    crypto, TextEncoder, TextDecoder, Uint8Array, atob, btoa, Request, Response, URL, AbortSignal,
    process: { env: {} }, ...globals,
  });
  return exports;
}
const credentials = load('supabase/functions/_shared/whatsapp-credentials.ts');
const secret = Buffer.alloc(32, 7).toString('base64');
const restaurantA = '11111111-1111-4111-8111-111111111111';
const restaurantB = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';
const customerPhone = '59170000000';

// A small query adapter that evaluates filters and mutations, rather than
// returning the same mock result regardless of tenant or conversation filters.
function memoryClient(rows, user = { id: userId }) {
  const queries = [];
  return {
    queries, auth: { getUser: async () => ({ data: { user } }) },
    from(table) {
      let filters = [], operation = 'read', values, options, single = false, max = Infinity, sort;
      const record = { table, filters }; queries.push(record);
      const query = {
        select() { return query; },
        eq(key, value) { filters.push((row) => row[key] === value); return query; },
        is(key, value) { return query.eq(key, value); },
        in(key, items) { filters.push((row) => items.includes(row[key])); return query; },
        or(expression) { const conditions = expression.split(',').map((part) => part.split('.eq.')); filters.push((row) => conditions.some(([key, value]) => row[key] === value)); return query; },
        gt(key, value) { filters.push((row) => row[key] > value); return query; },
        gte(key, value) { filters.push((row) => row[key] >= value); return query; },
        ilike(key, value) { filters.push((row) => String(row[key]).toLowerCase().includes(value.replaceAll('%', '').toLowerCase())); return query; },
        order(key, options) { sort = { key, descending: !options?.ascending }; return query; },
        limit(value) { max = value; return query; },
        maybeSingle() { single = true; return query; }, single() { single = true; return query; },
        insert(value) { operation = 'insert'; values = value; return query; },
        upsert(value, opts) { operation = 'upsert'; values = value; options = opts; return query; },
        update(value) { operation = 'update'; values = value; return query; },
        delete() { operation = 'delete'; return query; },
        then(resolve) {
          const all = rows[table] ??= [];
          let result = all.filter((row) => filters.every((filter) => filter(row)));
          if (operation === 'update') result.forEach((row) => Object.assign(row, values));
          if (operation === 'delete') { rows[table] = all.filter((row) => !result.includes(row)); result = []; }
          if (operation === 'insert' || operation === 'upsert') {
            result = [];
            for (const value of Array.isArray(values) ? values : [values]) {
              const keys = (options?.onConflict ?? 'id').split(',');
              const existing = operation === 'upsert' && all.find((row) => keys.every((key) => row[key] === value[key]));
              if (existing && options?.ignoreDuplicates) continue;
              const row = existing || { id: crypto.randomUUID(), consumed_at: null, expires_at: new Date(Date.now() + 900000).toISOString() };
              Object.assign(row, value);
              if (!existing) all.push(row);
              result.push(row);
            }
          }
          if (sort) result.sort((a, b) => String(a[sort.key]).localeCompare(String(b[sort.key])) * (sort.descending ? -1 : 1));
          result = result.slice(0, max).map((row) => ({ ...row }));
          return Promise.resolve({ data: single ? result[0] ?? null : result, error: null }).then(resolve);
        },
      };
      return query;
    },
  };
}
function webhookFixture(rows = {}, env = {}) {
  const client = memoryClient(rows);
  const sends = [];
  const bot = load('supabase/functions/whatsapp-webhook/index.ts', {
    'https://esm.sh/@supabase/supabase-js@2.108.2': { createClient: () => client },
    '../_shared/whatsapp-credentials.ts': credentials,
  }, {
    Deno: { env: { get: (key) => ({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test', WHATSAPP_TOKEN: 'platform-token', WHATSAPP_PHONE_NUMBER_ID: '999', ...env })[key] }, serve() {} },
    fetch: async (url, options) => { sends.push({ url, options, body: JSON.parse(options.body) }); return Response.json({ messages: [{ id: crypto.randomUUID() }] }); },
  }, '\nexport { channelContext, currentSender, resolveInboundChannel, extractIncomingMessageRows, ensureWhatsAppConversation, handleIncomingWhatsAppMessage, sendWhatsAppInteractiveButtons, findRestaurantById, listRecentOrdersByPhone, resetConversationForRestaurantSelection, hasValidMetaSignature, receiveWhatsAppWebhook };');
  return { bot, client, sends, rows };
}
const channel = (restaurantId, phoneNumberId) => ({ restaurantId, phoneNumberId, key: phoneNumberId, token: `token-${phoneNumberId}` });
const incoming = (id, phoneNumberId, direction = 'inbound') => ({ message_id: id, from_phone: customerPhone, to_phone_number_id: phoneNumberId, contact_name: 'Cliente', message_type: 'text', message_text: 'hola', payload: { direction }, whatsapp_timestamp: new Date().toISOString() });

test('credentials round-trip with random nonces and reject wrong branch, key, or ciphertext', async () => {
  const one = await credentials.encryptWhatsAppToken('private-token', secret, restaurantA);
  const two = await credentials.encryptWhatsAppToken('private-token', secret, restaurantA);
  assert.notEqual(one, two);
  assert.ok(!one.includes('private-token'));
  assert.equal(await credentials.decryptWhatsAppToken(one, secret, restaurantA), 'private-token');
  await assert.rejects(credentials.decryptWhatsAppToken(one, secret, restaurantB));
  await assert.rejects(credentials.decryptWhatsAppToken(one, Buffer.alloc(32, 8).toString('base64'), restaurantA));
  await assert.rejects(credentials.decryptWhatsAppToken(one.slice(0, -4) + 'AAAA', secret, restaurantA));
  await assert.rejects(credentials.encryptWhatsAppToken('token', 'c2hvcnQ=', restaurantA));
});

test('two simultaneous branch contexts never exchange outbound tokens or message history', async () => {
  const f = webhookFixture({ whatsapp_conversations: [
    { id: 'conversation-a', channel_key: '101', restaurant_id: restaurantA, from_phone: customerPhone },
    { id: 'conversation-b', channel_key: '202', restaurant_id: restaurantB, from_phone: customerPhone },
  ] });
  await Promise.all([[restaurantA, '101'], [restaurantB, '202']].map(([id, number]) => f.bot.channelContext.run(channel(id, number), async () => {
    await new Promise((resolve) => setTimeout(resolve, number === '101' ? 10 : 1));
    await f.bot.sendWhatsAppTextMessage({ to: customerPhone, body: id });
  })));
  for (const send of f.sends) {
    const number = send.body.text.body === restaurantA ? '101' : '202';
    assert.ok(send.url.includes(`/${number}/messages`));
    assert.equal(send.options.headers.Authorization, `Bearer token-${number}`);
  }
  assert.deepEqual(f.rows.whatsapp_messages.map((m) => [m.to_phone_number_id, m.conversation_id]).sort(), [['101', 'conversation-a'], ['202', 'conversation-b']]);
  assert.equal(f.bot.currentSender().key, 'platform');
});

test('a customer gets separate conversations in each destination channel', async () => {
  const f = webhookFixture({ whatsapp_messages: [incoming('a', '101'), incoming('b', '202')] });
  for (const [id, number, msg] of [[restaurantA, '101', 'a'], [restaurantB, '202', 'b']]) {
    await f.bot.channelContext.run(channel(id, number), () => f.bot.ensureWhatsAppConversation(f.client, incoming(msg, number)));
  }
  assert.equal(f.rows.whatsapp_conversations.length, 2);
  assert.notEqual(f.rows.whatsapp_messages[0].conversation_id, f.rows.whatsapp_messages[1].conversation_id);
  assert.deepEqual(f.rows.whatsapp_conversations.map((c) => c.restaurant_id), [restaurantA, restaurantB]);
});

test('Business App echoes are outgoing, pause automation and do not open the 24-hour window', async () => {
  const f = webhookFixture();
  const [echo] = f.bot.extractIncomingMessageRows({ entry: [{ changes: [{ field: 'smb_message_echoes', value: {
    metadata: { phone_number_id: '101' }, message_echoes: [{ id: 'echo1', from: 'business-phone', to: customerPhone, type: 'text', text: { body: 'Te atiendo' } }],
  } }] }] });
  assert.equal(echo.from_phone, customerPhone);
  assert.equal(echo.payload.direction, 'outbound');
  await f.bot.channelContext.run(channel(restaurantA, '101'), async () => {
    await f.bot.handleIncomingWhatsAppMessage(f.client, echo);
    assert.equal(f.rows.whatsapp_conversations[0].last_customer_message_at, null);
    await f.bot.handleIncomingWhatsAppMessage(f.client, incoming('customer2', '101'));
  });
  assert.equal(f.rows.whatsapp_conversations[0].state, 'handoff');
  assert.equal(f.sends.length, 0);
});

test('branch channels cannot switch restaurant, list other orders or display a switch button', async () => {
  const f = webhookFixture({ restaurants: [{ id: restaurantA, status: 'active', deleted_at: null }, { id: restaurantB, status: 'active', deleted_at: null }],
    orders: [{ id: 'order-a', restaurant_id: restaurantA, customer_phone_normalized: customerPhone }, { id: 'order-b', restaurant_id: restaurantB, customer_phone_normalized: customerPhone }],
    whatsapp_conversations: [{ id: 'conversation-a', restaurant_id: restaurantA, channel_key: '101', from_phone: customerPhone }],
  });
  await f.bot.channelContext.run(channel(restaurantA, '101'), async () => {
    assert.equal(await f.bot.findRestaurantById(f.client, restaurantB), null);
    assert.equal((await f.bot.listRecentOrdersByPhone(f.client, customerPhone))[0].id, 'order-a');
    assert.equal((await f.bot.listRecentOrdersByPhone(f.client, customerPhone)).length, 1);
    await f.bot.sendWhatsAppInteractiveButtons({ to: customerPhone, body: 'Menú', buttons: [{ id: 'ACTION_CHANGE_RESTAURANT', title: 'Cambiar lugar' }, { id: 'ACTION_MENU', title: 'Menú' }] });
    await f.bot.resetConversationForRestaurantSelection(f.client, 'conversation-a', 'order_created', 'm1');
  });
  assert.equal(f.rows.whatsapp_conversations[0].state, 'idle');
  assert.equal(f.rows.whatsapp_conversations[0].restaurant_id, restaurantA);
  assert.deepEqual(f.sends[0].body.interactive.action.buttons.map((b) => b.reply.id), ['ACTION_MENU']);
});

test('inbound resolution rejects unknown, expired and disconnected numbers without global fallback', async () => {
  const cipher = await credentials.encryptWhatsAppToken('branch-token', secret, restaurantA);
  const f = webhookFixture({ restaurant_whatsapp_connections: [{ phone_number_id: '101', restaurant_id: restaurantA, status: 'connected', token_ciphertext: cipher }], restaurants: [{ id: restaurantA, status: 'active', deleted_at: null }] }, { WHATSAPP_CREDENTIALS_KEY: secret });
  assert.equal(await f.bot.resolveInboundChannel(f.client, '123'), null);
  assert.equal(await f.bot.resolveInboundChannel(f.client, null), null);
  assert.equal((await f.bot.resolveInboundChannel(f.client, '999')).key, 'platform');
  assert.equal((await f.bot.resolveInboundChannel(f.client, '101')).token, 'branch-token');
  f.rows.restaurant_whatsapp_connections[0].token_expires_at = '2020-01-01';
  assert.equal(await f.bot.resolveInboundChannel(f.client, '101'), null);
  assert.equal(f.rows.restaurant_whatsapp_connections[0].status, 'needs_reconnect');
  f.rows.restaurant_whatsapp_connections[0].status = 'disconnected';
  assert.equal(await f.bot.resolveInboundChannel(f.client, '101'), null);
});

test('tenant-enabled webhook fails closed without a Meta signature', async () => {
  const f = webhookFixture({}, { WHATSAPP_CREDENTIALS_KEY: secret, META_APP_SECRET: 'app-secret' });
  const body = JSON.stringify({ entry: [] });
  assert.equal(await f.bot.hasValidMetaSignature(new Request('https://example.com'), body), false);
  const hmac = require('node:crypto').createHmac('sha256', 'app-secret').update(body).digest('hex');
  assert.equal(await f.bot.hasValidMetaSignature(new Request('https://example.com', { headers: { 'x-hub-signature-256': `sha256=${hmac}` } }), body), true);
  const noSecret = webhookFixture({}, { WHATSAPP_CREDENTIALS_KEY: secret });
  assert.equal(await noSecret.bot.hasValidMetaSignature(new Request('https://example.com'), body), false);
});

function serviceFixture(rows, user = { id: userId }) {
  const client = memoryClient(rows, user);
  const service = load('src/lib/services/whatsapp-connection.service.ts', {
    'server-only': {}, '@/lib/supabase/admin': { createAdminClient: () => client }, '@/lib/supabase/server': { createClient: async () => client },
    '../../../supabase/functions/_shared/whatsapp-credentials': credentials,
  }, { process: { env: { META_APP_ID: 'meta-app', META_APP_SECRET: 'app-secret', META_WHATSAPP_CONFIG_ID: 'config', WHATSAPP_CREDENTIALS_KEY: secret } } });
  return { service, client };
}
test('only owner, branch administrator or superadmin can manage connections', async () => {
  const rows = { profiles: [{ id: userId, global_role: 'user' }], restaurants: [{ id: restaurantA, owner_user_id: 'someone-else', status: 'active', deleted_at: null }], restaurant_memberships: [{ user_id: userId, restaurant_id: restaurantA, role: 'cashier', is_active: true }] };
  const f = serviceFixture(rows);
  await assert.rejects(f.service.requireWhatsAppManager(restaurantA));
  rows.restaurant_memberships[0].role = 'restaurant_admin';
  await f.service.requireWhatsAppManager(restaurantA);
  rows.restaurant_memberships[0].is_active = false;
  await assert.rejects(f.service.requireWhatsAppManager(restaurantA));
  rows.restaurants[0].owner_user_id = userId;
  await f.service.requireWhatsAppManager(restaurantA);
  await assert.rejects(serviceFixture(rows, null).service.requireWhatsAppManager(restaurantA));
  rows.restaurants[0].owner_user_id = 'someone-else';
  rows.profiles[0].global_role = 'superadmin';
  await f.service.requireWhatsAppManager(restaurantA);
});

test('connection public status excludes credentials and freeform sends require a customer window', async () => {
  const rows = { restaurants: [{ id: restaurantA, owner_user_id: userId, status: 'active', deleted_at: null }], restaurant_whatsapp_connections: [{ restaurant_id: restaurantA, status: 'connected', token_ciphertext: 'SECRET', display_phone_number: '+59170000001' }] };
  const { service } = serviceFixture(rows);
  const status = await service.getWhatsAppConnectionStatus(restaurantA);
  assert.equal(status.canManage, true);
  assert.ok(!JSON.stringify(status).includes('SECRET'));
  assert.equal(service.insideWhatsAppReplyWindow(new Date().toISOString()), true);
  assert.equal(service.insideWhatsAppReplyWindow(new Date(Date.now() - 86400001).toISOString()), false);
  assert.equal(service.insideWhatsAppReplyWindow(null), false);
  assert.equal(service.insideWhatsAppReplyWindow(new Date(Date.now() + 10000).toISOString()), false);
});

test('CRM history is scoped to conversation, even for the same customer in two branches', async () => {
  const rows = { whatsapp_conversations: [
    { id: 'conversation-a', restaurant_id: restaurantA, customer_id: 'customer', from_phone: customerPhone, channel_key: '101' },
    { id: 'conversation-b', restaurant_id: restaurantB, customer_id: 'customer', from_phone: customerPhone, channel_key: '202' },
  ], whatsapp_messages: [
    { id: 'message-a', conversation_id: 'conversation-a', from_phone: customerPhone, message_text: 'ONLY A', payload: {}, received_at: '2026-09-17' },
    { id: 'message-b', conversation_id: 'conversation-b', from_phone: customerPhone, message_text: 'PRIVATE B', payload: {}, received_at: '2026-09-18' },
  ] };
  const { client, service } = serviceFixture(rows);
  const { whatsappCrmService } = load('src/lib/services/whatsapp-crm.service.ts', {
    '@/lib/supabase/admin': { createAdminClient: () => client }, '@/lib/supabase/env': { hasSupabaseEnv: () => true },
    '@/lib/services/whatsapp-connection.service': service,
  });
  const workspace = await whatsappCrmService.getWorkspace(restaurantA, 'conversation-b');
  assert.equal(workspace.messages.length, 1);
  assert.equal(workspace.messages[0].text, 'ONLY A');
  assert.equal(workspace.conversations[0].lastMessage.text, 'ONLY A');
  assert.ok(!JSON.stringify(workspace).includes('PRIVATE B'));
});

function onboardingFixture() {
  const rows = { restaurants: [{ id: restaurantA, owner_user_id: userId, status: 'active', deleted_at: null }] };
  const { client, service } = serviceFixture(rows);
  const calls = [];
  const meta = { valid: true, phone: '101', coexistence: true, subscribe: true };
  const actions = load('src/app/admin/restaurantes/[restaurantId]/whatsapp/connection-actions.ts', {
    'next/cache': { revalidatePath() {} },
    '../../../../../../supabase/functions/_shared/whatsapp-credentials': credentials,
    '@/lib/services/whatsapp-connection.service': { ...service, metaRequest: async (path, token, options) => {
      calls.push({ path, token, options });
      if (path === 'oauth/access_token') return { access_token: 'customer-secret-token' };
      if (path.startsWith('debug_token?')) return { data: { is_valid: meta.valid, app_id: 'meta-app', scopes: ['whatsapp_business_management', 'whatsapp_business_messaging'] } };
      if (path.includes('/phone_numbers?')) return { data: [{ id: meta.phone, display_phone_number: '+59170000001', is_on_biz_app: meta.coexistence }] };
      if (path.endsWith('/subscribed_apps')) return { success: meta.subscribe };
      throw new Error('Unexpected Meta endpoint');
    } },
  }, { process: { env: { META_APP_ID: 'meta-app', META_APP_SECRET: 'app-secret', META_WHATSAPP_CONFIG_ID: 'config', WHATSAPP_CREDENTIALS_KEY: secret } } });
  const finish = async () => {
    const prepared = await actions.prepareWhatsAppConnectionAction(restaurantA);
    assert.equal(prepared.ok, true);
    const input = { restaurantId: restaurantA, sessionId: prepared.sessionId, code: 'one-time-code', phoneNumberId: '101', wabaId: '1000' };
    return { result: await actions.finishWhatsAppConnectionAction(input), input };
  };
  return { rows, client, actions, calls, meta, finish };
}

test('onboarding validates the Meta grant, encrypts its token, subscribes and consumes the session once', async () => {
  const f = onboardingFixture();
  const { result, input } = await f.finish();
  assert.equal(result.ok, true, result.error);
  assert.equal(result.state.connection.status, 'connected');
  assert.ok(!JSON.stringify(result).includes('customer-secret-token'));
  const connection = f.rows.restaurant_whatsapp_connections[0];
  assert.notEqual(connection.token_ciphertext, 'customer-secret-token');
  assert.equal(await credentials.decryptWhatsAppToken(connection.token_ciphertext, secret, restaurantA), 'customer-secret-token');
  assert.equal(f.calls.at(-1).path, '1000/subscribed_apps');
  assert.ok(f.calls.every((call) => !call.path.includes('/register')));
  const callCount = f.calls.length;
  assert.equal((await f.actions.finishWhatsAppConnectionAction(input)).ok, false);
  assert.equal(f.calls.length, callCount);
  const disconnected = await f.actions.disconnectWhatsAppConnectionAction(restaurantA);
  assert.equal(disconnected.ok, true);
  assert.equal(connection.status, 'disconnected');
  assert.equal(connection.token_ciphertext, null);
  assert.equal(f.calls.length, callCount, 'local disconnect must not unsubscribe a shared WABA');
});

test('onboarding rejects forged WABA/phone completion, missing coexistence and invalid grant', async () => {
  for (const [property, value] of [['phone', '202'], ['coexistence', false], ['valid', false]]) {
    const f = onboardingFixture(); f.meta[property] = value;
    const { result } = await f.finish();
    assert.equal(result.ok, false);
    assert.equal(f.rows.restaurant_whatsapp_connections?.length ?? 0, 0);
    assert.ok(!f.calls.some((call) => call.path.endsWith('/subscribed_apps')));
  }
  const f = onboardingFixture(); f.meta.subscribe = false;
  assert.equal((await f.finish()).result.ok, false);
  assert.equal(f.rows.restaurant_whatsapp_connections[0].status, 'needs_reconnect');
});

test('onboarding sessions cannot be completed by a different owner or branch', async () => {
  const f = onboardingFixture();
  const prepared = await f.actions.prepareWhatsAppConnectionAction(restaurantA);
  const session = f.rows.whatsapp_onboarding_sessions[0];
  session.user_id = 'different-user';
  const result = await f.actions.finishWhatsAppConnectionAction({ restaurantId: restaurantA, sessionId: prepared.sessionId, code: 'code', phoneNumberId: '101', wabaId: '1000' });
  assert.equal(result.ok, false);
  assert.equal(f.calls.length, 0);
});

test('order notifications use their original channel and never fall back when that channel is disconnected', async () => {
  const now = new Date().toISOString();
  const rows = { orders: [{ id: 'order-a', restaurant_id: restaurantA, order_origin: 'phone_whatsapp', customer_phone: customerPhone, order_number: 'W-1' }],
    whatsapp_order_channels: [{ order_id: 'order-a', restaurant_id: restaurantA, conversation_id: 'conversation-a', channel_key: '101' }],
    whatsapp_conversations: [
      { id: 'conversation-a', restaurant_id: restaurantA, from_phone: customerPhone, channel_key: '101', last_customer_message_at: now },
      { id: 'conversation-platform', restaurant_id: restaurantA, from_phone: customerPhone, channel_key: 'platform', last_customer_message_at: now },
    ], restaurants: [{ id: restaurantA, name: 'Restaurante A', slug: 'restaurante-a' }],
  };
  const client = memoryClient(rows);
  const sends = [], channels = [];
  let connected = true;
  const { service } = serviceFixture({});
  const { sendOrderWhatsAppNotification } = load('src/lib/services/order-whatsapp-notification.service.ts', {
    '@/lib/supabase/admin': { createAdminClient: () => client }, '@/lib/seo/site-url': { getSiteUrl: () => 'https://example.com' },
    '@/lib/services/whatsapp-connection.service': { ...service, resolveWhatsAppSender: async (restaurant, channelKey) => { channels.push([restaurant, channelKey]); return connected ? { token: 'token-a', phoneNumberId: '101' } : null; } },
  }, { fetch: async (url, options) => { sends.push({ url, options }); return Response.json({ messages: [{ id: 'sent-a' }] }); } });
  assert.equal((await sendOrderWhatsAppNotification({ orderId: 'order-a', event: 'ready' })).ok, true);
  assert.ok(sends[0].url.includes('/101/messages'));
  assert.equal(rows.whatsapp_messages[0].conversation_id, 'conversation-a');
  connected = false;
  assert.equal((await sendOrderWhatsAppNotification({ orderId: 'order-a', event: 'delivered' })).ok, false);
  assert.equal(sends.length, 1);
  assert.ok(channels.every(([id, key]) => id === restaurantA && key === '101'));
  rows.whatsapp_conversations[0].last_customer_message_at = '2020-01-01';
  assert.equal((await sendOrderWhatsAppNotification({ orderId: 'order-a', event: 'ready' })).skipped, 'whatsapp-window-closed');
});

test('migration preserves legacy history, enforces channel uniqueness, isolates credentials and binds orders', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create table restaurants(id uuid primary key);
      create table orders(id uuid primary key, restaurant_id uuid, order_origin text, public_request_id uuid);
      create function set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
    `);
    await db.exec(source('supabase/migrations/0083_whatsapp_messages.sql'));
    await db.exec(source('supabase/migrations/0084_whatsapp_customer_conversations.sql'));
    await db.exec(`
      insert into restaurants values ('${restaurantA}'), ('${restaurantB}');
      insert into whatsapp_customers(id,phone) values ('${userId}','${customerPhone}');
      insert into whatsapp_conversations(id,customer_id,from_phone,restaurant_id) values ('${restaurantA}','${userId}','${customerPhone}','${restaurantA}');
      insert into whatsapp_messages(message_id,from_phone,message_type,payload,whatsapp_timestamp) values ('legacy','${customerPhone}','text','{}','2026-01-01');
    `);
    await db.exec(source('supabase/migrations/0105_branch_whatsapp_connections.sql'));
    const legacy = (await db.query('select conversation_id from whatsapp_messages')).rows[0];
    assert.equal(legacy.conversation_id, restaurantA);
    await db.exec(`
      insert into whatsapp_conversations(id,customer_id,from_phone,restaurant_id,channel_key) values ('${restaurantB}','${userId}','${customerPhone}','${restaurantB}','202');
      insert into restaurant_whatsapp_connections(restaurant_id,phone_number_id,waba_id,display_phone_number) values ('${restaurantA}','101','1000','+5911');
    `);
    await assert.rejects(db.exec(`insert into restaurant_whatsapp_connections(restaurant_id,phone_number_id,waba_id,display_phone_number) values ('${restaurantB}','101','1000','+5911')`), /unique/);
    await assert.rejects(db.exec(`update restaurant_whatsapp_connections set phone_number_id='303'`), /immutable/);
    await db.exec(`update whatsapp_conversations set last_customer_message_at='2020-01-01' where id='${restaurantA}'`);
    assert.match((await db.query(`select last_customer_message_at::text as timestamp from whatsapp_conversations where id='${restaurantA}'`)).rows[0].timestamp, /^2026-01-01/);
    await db.exec(`
      insert into whatsapp_order_drafts(id,conversation_id,customer_id,restaurant_id) values ('${userId}','${restaurantB}','${userId}','${restaurantB}');
      insert into orders(id,restaurant_id,order_origin,public_request_id) values ('${restaurantA}','${restaurantB}','phone_whatsapp','${userId}');
    `);
    const binding = (await db.query('select * from whatsapp_order_channels')).rows[0];
    assert.equal(binding.channel_key, '202');
    assert.equal(binding.restaurant_id, restaurantB);
    await db.exec('set role authenticated');
    await assert.rejects(db.query('select token_ciphertext from restaurant_whatsapp_connections'), /permission denied/);
    await assert.rejects(db.query('select * from whatsapp_onboarding_sessions'), /permission denied/);
  } finally { await db.close(); }
});
