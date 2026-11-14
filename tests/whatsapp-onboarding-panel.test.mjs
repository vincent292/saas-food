import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/components/whatsapp/WhatsAppConnectionPanel.tsx', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;

function fixture() {
  const window = new EventTarget();
  const effects = [], calls = [], messages = [], timers = new Map();
  const prepared = { sessionId: 'session', appId: 'app', configId: 'config', version: 'v26.0' };
  let hook = 0, nextTimer = 0, loginCallback;
  const setTimeout = (callback) => { const id = ++nextTimer; timers.set(id, callback); return id; };
  const clearTimeout = (id) => timers.delete(id);
  Object.assign(window, { setTimeout, clearTimeout, FB: {
    init() {}, login(callback) { loginCallback = callback; },
  } });
  const actions = {
    finishWhatsAppConnectionAction: async (input) => {
      calls.push(input);
      return { ok: true, state: { setupReady: true, canManage: true, connection: { status: 'connected' } } };
    },
  };
  const exports = {};
  vm.runInNewContext(output, {
    exports, window, Event, setTimeout, clearTimeout,
    require(name) {
      if (name === 'react') return {
        useEffect(callback) { effects.push(callback); },
        useRef(value) { return { current: value }; },
        useState(initial) {
          const index = hook++;
          return [index === 1 ? prepared : index === 2 ? true : initial, (value) => { if (index === 4) messages.push(value); }];
        },
      };
      if (name.includes('/connection-actions')) return actions;
      if (['next/script', 'next/link'].includes(name)) return { default: name };
      if (name === '@/components/ui/Button') return { Button: 'button' };
      if (name === '@/components/ui/Card') return { Card: 'section' };
      return require(name);
    },
  });
  const tree = exports.WhatsAppConnectionPanel({ restaurantId: 'restaurant', restaurantName: 'Pruebas', initialState: { canManage: true, setupReady: true, connection: null } });
  const cleanup = effects[0]();
  function findConnect(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'button' && node.props.children === 'Continuar con Meta') return node;
    for (const child of [node.props?.children].flat(Infinity)) { const found = findConnect(child); if (found) return found; }
  }
  findConnect(tree).props.onClick();
  return {
    calls, messages, cleanup,
    code() { loginCallback({ authResponse: { code: 'one-time-code' } }); },
    event(data, origin = 'https://www.facebook.com') {
      window.dispatchEvent(Object.assign(new Event('message'), { data: JSON.stringify(data), origin }));
    },
    async flush() {
      const pending = [...timers.values()]; timers.clear(); pending.forEach((callback) => callback());
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
}

const completion = { type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING', data: { phone_number_id: '101', waba_id: '1000' } };

test('signup completes exactly once with the code and popup event in either order', async () => {
  for (const order of ['event-first', 'code-first']) {
    const f = fixture();
    if (order === 'event-first') { f.event(completion); f.code(); }
    else { f.code(); f.event(completion); }
    await f.flush();
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].phoneNumberId, '101');
    assert.equal(f.calls[0].wabaId, '1000');
    f.cleanup();
  }
});

test('signup submits the authorization for server recovery if the popup event is missing', async () => {
  const f = fixture(); f.code();
  assert.equal(f.calls.length, 0, 'briefly wait for the exact popup selection');
  await f.flush();
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].code, 'one-time-code');
  assert.equal(f.calls[0].phoneNumberId, undefined);
  assert.equal(f.calls[0].wabaId, undefined);
  f.cleanup();
});

test('a completed popup without an SDK authorization reports the missing authorization', async () => {
  const f = fixture(); f.event(completion);
  await f.flush();
  assert.equal(f.calls.length, 0);
  assert.match(f.messages.at(-1), /no devolvió la autorización a Yopido/);
  f.cleanup();
});

test('signup accepts WABA-only completion and never trusts a foreign origin', async () => {
  for (const foreign of [false, true]) {
    const f = fixture(); f.code();
    f.event({ ...completion, event: 'FINISH_ONLY_WABA', data: { waba_id: '1000' } }, foreign ? 'https://attacker.example' : 'https://business.facebook.com');
    await f.flush();
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].wabaId, foreign ? undefined : '1000');
    assert.equal(f.calls[0].phoneNumberId, undefined);
    f.cleanup();
  }
});

test('cancelled signup or an unmounted panel cannot complete a pending recovery', async () => {
  for (const unmount of [false, true]) {
    const f = fixture(); f.code();
    if (unmount) f.cleanup();
    else f.event({ type: 'WA_EMBEDDED_SIGNUP', event: 'CANCEL' });
    await f.flush();
    assert.equal(f.calls.length, 0);
    if (!unmount) f.cleanup();
  }
});
