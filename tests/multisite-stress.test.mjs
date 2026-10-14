import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';

test('isolated multi-commerce creation, queue and group claim regression', { timeout: 60000 }, async () => {
  const { stdout } = await promisify(execFile)(process.execPath, ['scripts/stress-multisite.mjs'], {
    cwd: new URL('../', import.meta.url), timeout: 55000,
    env: { ...process.env, STRESS_ORDERS: '10', STRESS_CONCURRENCY: '5' },
  });
  const report = JSON.parse(stdout.slice(stdout.indexOf('{')));
  assert.equal(report.result, 'PASS');
  assert.equal(report.masters, 10);
  assert.equal(report.childOrders, 25);
  assert.equal(report.saturatedQueue.active, 10);
  assert.equal(report.clearedQueue.active, 1);
});
