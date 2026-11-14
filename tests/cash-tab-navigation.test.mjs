import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/components/cash/CashWorkspaceClient.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('CashWorkspaceClient.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'switchTab') handler = node.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
function fixture(loadedTab = 'venta') {
  const context = { activeTab: loadedTab, loadedTab, URL, calls: [], window: { location: { href: 'https://example.test/caja?tab=' + loadedTab + '&restaurant=local' }, history: { replaceState() { throw Error('Navigation must preserve the Next router state'); } } } };
  context.setActiveTab = next => { context.activeTab = next; };
  context.router = { replace: (url, options) => context.calls.push({ url, options }) };
  context.instantOperationalTabs = new Set(['pedidos', 'delivery', 'recojo']);
  vm.createContext(context);
  vm.runInContext(ts.transpileModule(handler + '\nglobalThis.navigate = switchTab;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context;
}
test('every cash section selects immediately and requests its own server data', () => {
  for (const tab of ['mesas', 'pedidos', 'delivery', 'recojo', 'movimientos', 'egresos', 'cierre', 'reportes', 'venta']) {
    const f = fixture(tab === 'venta' ? 'mesas' : 'venta');
    f.navigate(tab);
    assert.equal(f.activeTab, tab);
    assert.equal(new URL(f.calls[0].url, 'https://example.test').searchParams.get('tab'), tab);
    assert.match(f.calls[0].url, /restaurant=local/);
    assert.equal(f.calls[0].options.scroll, false);
  }
});
test('operational switches preserve router state; pending destinations can be retried', () => {
  const f = fixture('pedidos');
  f.navigate('delivery'); f.navigate('mesas'); f.navigate('mesas');
  assert.equal(f.activeTab, 'mesas');
  assert.equal(f.calls.length, 3);
  f.loadedTab = 'mesas'; f.navigate('mesas');
  assert.equal(f.calls.length, 3);
});
