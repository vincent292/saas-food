import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const require = createRequire(import.meta.url);
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const restaurantId = '11111111-1111-4111-8111-111111111111';
const channel = { key: '101', phoneNumberId: '101', token: 'branch-private-token', restaurantId };
const customer = '59170000000';
const future = new Date(Date.now() + 3600000).toISOString();
const image = 'data:image/png;base64,' + Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]).toString('base64');

function fixture({ rows = {}, fetcher, extra = '' } = {}) {
  const requests = [];
  const db = { from(table) {
    const filters = []; let single = false, operation, value, conflict;
    const query = {
      select() { return query; }, eq(key, v) { filters.push(row => row[key] === v); return query; },
      gt(key, v) { filters.push(row => row[key] > v); return query; },
      order() { return query; }, limit() { return query; },
      maybeSingle() { single = true; return query; }, single() { single = true; return query; },
      upsert(v, opts) { operation = 'upsert'; value = v; conflict = opts?.onConflict; return query; },
      update(v) { operation = 'update'; value = v; return query; },
      then(resolve) {
        const all = rows[table] ??= [];
        let result = all.filter(row => filters.every(filter => filter(row)));
        if (operation === 'upsert') {
          const keys = (conflict ?? 'id').split(',');
          const existing = all.find(row => keys.every(key => row[key] === value[key]));
          if (existing) Object.assign(existing, value); else all.push(value);
          result = [value];
        }
        if (operation === 'update') result.forEach(row => Object.assign(row, value));
        return Promise.resolve({ data: single ? result[0] ?? null : result, error: null }).then(resolve);
      },
    };
    return query;
  } };
  const exports = {};
  const source = read('supabase/functions/whatsapp-webhook/index.ts') + `\nexport { channelContext, extractMetaFreeEntryWindows, findMetaFreeEntryWindow, hasConfirmedFreeEntryWindow, sendOrderBankQr, uploadBankQrToWhatsApp, sendRestaurantMenuIntro, beginProductConfiguration, receiveWhatsAppWebhook };\n` + extra;
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, require: name => name.startsWith('https://') ? { createClient: () => db } : name.includes('whatsapp-credentials') ? {} : require(name),
    Deno: { env: { get: key => ({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test', NEXT_PUBLIC_SITE_URL: 'https://yopido.shop', META_APP_SECRET: 'signed-test-secret' })[key] }, serve() {} },
    crypto, console, Uint8Array, TextEncoder, TextDecoder, URL, Request, Response, AbortSignal, FormData, Blob, atob, btoa,
    fetch: async (url, options) => {
      const request = { url: String(url), options, body: typeof options.body === 'string' ? JSON.parse(options.body) : options.body };
      requests.push(request);
      return fetcher ? fetcher(request, requests) : Response.json({ messages: [{ id: crypto.randomUUID() }] });
    },
  });
  return { bot: exports, requests, db, rows };
}

function event(statusOverrides = {}, valueOverrides = {}) {
  return { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: {
    metadata: { phone_number_id: '101' }, statuses: [{ id: 'wamid.free', status: 'sent', recipient_id: customer,
      conversation: { expiration_timestamp: String(Math.floor(Date.parse(future) / 1000)) },
      pricing: { type: 'free_entry_point', billable: false }, ...statusOverrides }], ...valueOverrides,
  } }] }] };
}

test('only explicit free entry pricing and a valid Meta expiry enable guided replies', () => {
  const { bot } = fixture();
  for (const status of ['sent', 'delivered', 'read']) assert.equal(bot.extractMetaFreeEntryWindows(event({ status })).length, 1);
  for (const override of [{ status: 'failed' }, { conversation: {} }, { conversation: { expiration_timestamp: 'Infinity' } },
    { conversation: { expiration_timestamp: '1' } }, { pricing: { type: 'regular', billable: true } },
    { pricing: { type: 'free_customer_service', billable: false } }, { pricing: { type: 'free_entry_point' } }, { recipient_id: 'wrong' }]) {
    assert.equal(bot.extractMetaFreeEntryWindows(event(override)).length, 0);
  }
  assert.equal(bot.extractMetaFreeEntryWindows(event({}, { statuses: [], messages: [{ referral: { source_type: 'ad' } }] })).length, 0);
});

test('free entry lookup is isolated by receiving number, customer, branch and expiry', async () => {
  const { bot, db } = fixture({ rows: { whatsapp_free_entry_windows: [
    { phone_number_id: '101', customer_phone: customer, restaurant_id: restaurantId, expires_at: future },
    { phone_number_id: '202', customer_phone: customer, restaurant_id: 'other-branch', expires_at: future },
  ] } });
  assert.equal(await bot.findMetaFreeEntryWindow(db, channel, customer), future);
  assert.equal(await bot.findMetaFreeEntryWindow(db, channel, '59170000001'), undefined);
  assert.equal(await bot.findMetaFreeEntryWindow(db, { ...channel, phoneNumberId: '202' }, customer), undefined);
  assert.equal(await bot.channelContext.run({ ...channel, freeEntryExpiresAt: future }, () => bot.hasConfirmedFreeEntryWindow()), true);
  assert.equal(await bot.channelContext.run({ ...channel, freeEntryExpiresAt: '2020-01-01' }, () => bot.hasConfirmedFreeEntryWindow()), false);
  const broken = { from() { throw new Error('offline'); } };
  assert.equal(await bot.findMetaFreeEntryWindow(broken, channel, customer), undefined);
});

test('signed status-only callbacks persist verified campaign windows and unsigned callbacks cannot create them', async () => {
  const f = fixture({ extra: `resolveInboundChannel = async (_db, phone) => phone === '101' ? ${JSON.stringify(channel)} : null;` });
  const raw = JSON.stringify(event());
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('signed-test-secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = Buffer.from(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw))).toString('hex');
  const request = sig => new Request('https://example.test/webhook', { method: 'POST', body: raw, headers: { 'x-hub-signature-256': sig } });
  assert.equal((await f.bot.receiveWhatsAppWebhook(request('sha256=bad'))).status, 401);
  assert.equal(f.rows.whatsapp_free_entry_windows, undefined);
  const response = await f.bot.receiveWhatsAppWebhook(request('sha256=' + signature));
  assert.equal(response.status, 200);
  assert.equal(f.rows.whatsapp_free_entry_windows.length, 1);
  assert.equal(f.rows.whatsapp_free_entry_windows[0].restaurant_id, restaurantId);
  assert.equal(f.rows.whatsapp_free_entry_windows[0].customer_phone, customer);
  assert.equal(f.requests.length, 0, 'a delivery status must never trigger a bot reply');
});

test('a direct greeting contains checkout link and ordering help in one message; confirmed campaigns retain favorites', async () => {
  const f = fixture();
  const restaurant = { id: restaurantId, name: 'Pruebas', slug: 'pruebas' };
  const products = [{ id: 'p1', name: 'Hamburguesa', price: 20, is_featured: true }];
  await f.bot.channelContext.run(channel, () => f.bot.sendRestaurantMenuIntro(f.db, customer, restaurant, products));
  assert.equal(f.requests.length, 1);
  assert.match(f.requests[0].body.interactive.body.text, /pago QR/);
  assert.match(f.requests[0].body.interactive.body.text, /\/r\/pruebas\?pedido=1/);
  assert.doesNotMatch(f.requests[0].body.interactive.body.text, /Hamburguesa: Bs/);
  await f.bot.channelContext.run({ ...channel, freeEntryExpiresAt: future }, () => f.bot.sendRestaurantMenuIntro(f.db, customer, restaurant, products));
  assert.equal(f.requests.length, 2);
  assert.match(f.requests[1].body.interactive.body.text, /Hamburguesa: Bs/);
});

test('product photo is omitted for direct chats while the next ordering step still arrives', async () => {
  const f = fixture({ extra: `
    getProductConfiguration = async () => ({ product: { id: 'p1', name: 'Burger', price: 20, image_url: 'https://example.test/burger.jpg' }, variants: [], groups: [], options: [] });
    ensureOpenDraft = async () => ({});
    updateOpenDraft = async (_db, _conversation, patch) => patch;
    updateConversationState = async () => {};
    continuePendingItemConfiguration = async (_db, to) => sendWhatsAppTextMessage({to, body:'Cantidad y opciones del producto'});
  ` });
  const begin = () => f.bot.beginProductConfiguration(f.db, { from_phone: customer, message_id: 'in1' }, { id: 'c1' }, {}, { id: restaurantId }, 'p1');
  await f.bot.channelContext.run(channel, begin);
  assert.deepEqual(f.requests.map(r => r.body.type), ['text']);
  f.requests.length = 0;
  await f.bot.channelContext.run({ ...channel, freeEntryExpiresAt: future }, begin);
  assert.deepEqual(f.requests.map(r => r.body.type), ['image', 'text']);
});

const payment = { to: customer, orderId: 'order-one', token: 'order-tracking-capability-private', orderNumber: 'W-123', restaurantName: 'Pruebas', total: 25,
  paymentUrl: 'https://www.yopido.shop/r/pruebas/pago/order-one?token=order-tracking-capability-private' };

test('QR checkout reuses the authorized reservation and sends one branch-scoped image with amount and recovery link', async () => {
  const f = fixture({ fetcher: request => request.url.includes('/api/payments/')
    ? Response.json({ status: 'pending', amount: 25, image })
    : request.url.endsWith('/media') ? Response.json({ id: 'uploaded-qr' }) : Response.json({ messages: [{ id: 'wamid.qr' }] }) });
  await f.bot.channelContext.run(channel, () => f.bot.sendOrderBankQr(payment));
  const [bank, upload, send] = f.requests;
  assert.equal(bank.url, 'https://www.yopido.shop/api/payments/baneco/order?orderId=order-one');
  assert.equal(bank.options.headers['x-order-tracking-token'], payment.token);
  assert.ok(!bank.url.includes(payment.token));
  assert.equal(upload.options.headers.Authorization, 'Bearer branch-private-token');
  assert.ok(upload.body instanceof FormData);
  assert.equal(upload.body.get('file').type, 'image/png');
  assert.ok(send.url.endsWith('/101/messages'));
  assert.equal(send.body.type, 'image');
  assert.equal(send.body.image.id, 'uploaded-qr');
  assert.match(send.body.image.caption, /Bs 25\.00/);
  assert.ok(send.body.image.caption.includes(payment.paymentUrl));
  assert.match(send.body.image.caption, /cuando el banco confirme/);
  assert.equal(f.requests.filter(r => r.url.endsWith('/messages')).length, 1);
});

test('missing, mismatched, already-paid or timed-out QR operations fall back to one payment link without regenerating', async () => {
  for (const result of [null, { status: 'pending', amount: 26, image }, { status: 'pending', amount: 25, image: 'not-an-image' },
    { status: 'unknown', amount: 25 }, { status: 'paid', amount: 25 }]) {
    const f = fixture({ fetcher: request => {
      if (request.url.includes('/api/payments/')) {
        if (result === null) throw new Error('timeout');
        return Response.json(result);
      }
      return Response.json({ messages: [{ id: 'wamid.link' }] });
    } });
    await f.bot.channelContext.run(channel, () => f.bot.sendOrderBankQr(payment));
    assert.equal(f.requests.filter(r => r.url.includes('/api/payments/')).length, 1);
    assert.equal(f.requests.length, 2);
    assert.equal(f.requests[1].body.type, 'text');
    assert.ok(f.requests[1].body.text.body.includes(payment.paymentUrl));
    assert.doesNotMatch(f.requests[1].body.text.body, /enviado a Pruebas/);
  }
});

test('simultaneous QR sends preserve the bank capability, media and sender of each branch', async () => {
  const f = fixture({ fetcher: async request => {
    await new Promise(resolve => setTimeout(resolve, request.url.includes('/101/') ? 4 : 1));
    if (request.url.includes('/api/payments/')) return Response.json({ status: 'pending', amount: 25, image });
    if (request.url.endsWith('/media')) return Response.json({ id: request.url.includes('/101/') ? 'qr-a' : 'qr-b' });
    return Response.json({ messages: [{ id: crypto.randomUUID() }] });
  } });
  await Promise.all([
    f.bot.channelContext.run(channel, () => f.bot.sendOrderBankQr({ ...payment, orderNumber: 'W-A', token: 'capability-a' })),
    f.bot.channelContext.run({ ...channel, key: '202', phoneNumberId: '202', token: 'second-branch-token' }, () => f.bot.sendOrderBankQr({ ...payment, orderNumber: 'W-B', token: 'capability-b' })),
  ]);
  const sends = f.requests.filter(r => r.url.endsWith('/messages'));
  assert.equal(sends.length, 2);
  for (const send of sends) {
    const first = send.url.includes('/101/');
    assert.equal(send.options.headers.Authorization, first ? 'Bearer branch-private-token' : 'Bearer second-branch-token');
    assert.equal(send.body.image.id, first ? 'qr-a' : 'qr-b');
    assert.ok(send.body.image.caption.includes(first ? 'W-A' : 'W-B'));
  }
  assert.deepEqual(f.requests.filter(r => r.url.includes('/api/payments/')).map(r => r.options.headers['x-order-tracking-token']).sort(), ['capability-a', 'capability-b']);
});

test('browser roles cannot access campaign-window storage', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create table restaurants(id uuid primary key);');
    await db.exec(read('supabase/migrations/0140_whatsapp_free_entry_windows.sql'));
    await db.exec(`set role authenticated;`);
    await assert.rejects(db.query('select * from whatsapp_free_entry_windows'), /permission denied/);
    await db.exec('reset role; set role anon;');
    await assert.rejects(db.query('select * from whatsapp_free_entry_windows'), /permission denied/);
    await db.exec("reset role; set role service_role; insert into whatsapp_free_entry_windows(phone_number_id,customer_phone,expires_at,message_id) values('101','59170000000',now()+interval '1 hour','wamid.free');");
    assert.equal((await db.query('select count(*)::int count from whatsapp_free_entry_windows')).rows[0].count, 1);
  } finally { await db.close(); }
});
