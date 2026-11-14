import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const branch = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const conversation = '33333333-3333-4333-8333-333333333333';
const source = readFileSync(new URL('../src/app/api/mobile/whatsapp/route.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function fixture(role = 'cashier') {
  class PosError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
  const calls = [];
  const workspace = {
    conversations: [{ id: conversation, channel: 'branch', canReply: true }],
    selectedConversation: { id: conversation, channel: 'branch', canReply: true },
    messages: [{ id: 'message', source: 'bot', text: 'Menú de Pruebas' }],
    quickReplies: [{ id: 'reply', title: 'Horario', body: 'Abrimos a las 9', internal: 'private' }],
    whatsappConfigured: true, branchConnectionStatus: 'connected',
    usage: { internal: 'billing' }, botSettings: { internal: 'settings' },
  };
  const sendResult = { ok: true };
  const json = (body, status = 200) => Response.json(body, { status });
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, Response, URL,
    require(name) {
      if (name === '../pos/_shared') return {
        PosError, cors: {}, json,
        session: async (request) => { if (!request.headers.get('authorization')) throw new PosError('Inicia sesión.', 401); return {}; },
        restaurantAccess: (_auth, id) => { if (id !== branch) throw new PosError('Sin acceso.', 403); return { role }; },
        failure: (error) => json({ error: error.message }, error.status ?? 500),
      };
      if (name === '@/lib/services/whatsapp-crm.service') return { whatsappCrmService: {
        getWorkspace: async (...args) => { calls.push(['read', ...args]); return workspace; },
        sendTextMessage: async (input) => { calls.push(['send', input]); return sendResult; },
      } };
      return require(name);
    },
  });
  const get = (restaurantId = branch, authenticated = true) => exports.GET(new Request(`https://example.test/api/mobile/whatsapp?restaurantId=${restaurantId}&conversation=${conversation}`, { headers: authenticated ? { authorization: 'Bearer session' } : {} }));
  const post = (overrides = {}) => exports.POST(new Request('https://example.test/api/mobile/whatsapp', { method: 'POST', headers: { authorization: 'Bearer session', 'content-type': 'application/json' }, body: JSON.stringify({ action: 'send', restaurantId: branch, conversationId: conversation, body: 'Hola desde caja', ...overrides }) }));
  return { get, post, calls, sendResult };
}

test('mobile cashier receives the connected inbox without owner settings or billing data', async () => {
  const f = fixture(); const response = await f.get();
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.branchConnectionStatus, 'connected');
  assert.equal(data.selectedConversation.canReply, true);
  assert.equal(data.messages[0].source, 'bot');
  assert.equal(data.quickReplies[0].internal, undefined);
  assert.equal(data.usage, undefined);
  assert.equal(data.botSettings, undefined);
  assert.deepEqual(f.calls[0], ['read', branch, conversation]);
});

test('mobile inbox rejects anonymous sessions, other branches and unsupported roles before reading data', async () => {
  const f = fixture();
  assert.equal((await f.get(branch, false)).status, 401);
  assert.equal((await f.get(other)).status, 403);
  assert.equal(f.calls.length, 0);
  for (const role of ['waiter', 'restaurant_admin', 'superadmin']) {
    const unsupported = fixture(role);
    assert.equal((await unsupported.get()).status, 403);
    assert.equal((await unsupported.post()).status, 403);
    assert.equal(unsupported.calls.length, 0);
  }
});

test('mobile manual reply uses the cashier source and returns a useful expired-window error', async () => {
  const f = fixture();
  assert.equal((await f.post({ restaurantId: other })).status, 403);
  assert.equal((await f.post({ body: '' })).status, 400);
  assert.equal(f.calls.length, 0);
  assert.equal((await f.post()).status, 200);
  assert.equal(f.calls[0][1].source, 'pos_cashier');
  assert.equal(f.calls[0][1].restaurantId, branch);
  assert.equal(f.calls[0][1].conversationId, conversation);
  Object.assign(f.sendResult, { ok: false, error: 'whatsapp-window-closed' });
  const expired = await f.post();
  assert.equal(expired.status, 409);
  assert.match((await expired.json()).error, /24 horas/);
});
